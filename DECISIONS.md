# DECISIONS.md

Answers to the five required design questions from `PRD.md`.

## 1. What makes claiming atomic across processes?

The short answer: `acquireLock` (`src/core/lock.js:13`) opens the lock file with `open(LOCK_PATH, 'wx')`, which on POSIX systems means `O_CREAT | O_EXCL`. The kernel guarantees that if two processes try to create the same file at the same moment, only one `open()` call succeeds — every other caller gets `EEXIST`. That single syscall is the one thing everything else in this system leans on for safety.

`claimJob` (`src/core/jobStore.js:62-88`) uses that guarantee by doing all of its work — reading `jobs.json`, finding an eligible job, updating its `state`/`updated_at`/`worker_id`, and writing the file back — between `acquireLock(JOBS_LOCK_PATH)` and a `finally`-released `releaseLock`. Because the lock covers the whole read-modify-write cycle, a second worker can't read the "before" state until the first worker's claim has already been written. So two workers can never both see the same job as eligible at the same time. Every other function in `jobStore.js` that touches the file (`createJob`, `completeJob`, `failJob`, `retryFromDLQ`, `listJobs`) follows the same acquire-then-release shape for the same reason.

## 2. SIGKILL mid-job: recovery path and worst-case delay

What actually happens, step by step:

1. Worker A claims the job — `state` becomes `processing`, `updated_at` gets stamped — and starts running the command.
2. `SIGKILL` kills worker A instantly, no handler runs. The job is left stuck at `processing`, and `updated_at` stops moving.
3. Every other worker's `mainLoop` (`src/core/worker.js:45-74`) checks for this, throttled to at most once every `RECOVERY_CHECK_INTERVAL_MS` (5s), looking for `processing` jobs whose `updated_at` is older than `config.stale_job_timeout_ms` (45s by default).
4. A flagged job goes through the normal `failJob` path — a backoff retry, or straight to `dead` if it's already exhausted `max_retries`. There's no separate "recovery" state; it just re-enters the regular lifecycle.
5. **Worst case**, assuming at least one other worker stays alive: `stale_job_timeout_ms` + one `RECOVERY_CHECK_INTERVAL_MS`, roughly **50 seconds** — under the PRD's 60-second bar. (Verified manually with a 3-second timeout: recovered within ~7 seconds of `kill -9`.)

Two trade-offs worth being upfront about. First, if every worker dies at once, nothing recovers the job until a worker restarts — but a freshly started worker runs this check on its very first loop iteration, so restarting doesn't add another 5-second wait on top. Second, staleness is judged purely by how old `updated_at` is; there's no heartbeat. That means a job that legitimately runs longer than `stale_job_timeout_ms` can get pulled back into a retry even though its original worker is still alive and working on it. That's not really a bug — it's a configuration requirement: `stale_job_timeout_ms` needs to be set above the longest job you expect to run.

## 3. Does DLQ retry reset attempts?

Yes. `retryFromDLQ` (`jobStore.js:182-207`) sets `attempts` back to `0`, clears `next_attempt`, and moves the job's `state` back to `pending`.

The reasoning is straightforward: `dlq retry` is a manual action a human triggers, not part of the automatic backoff loop. A job only lands in the DLQ after it's already used up every retry in `max_retries`. If the reset didn't happen, the very next failure would immediately trip `attempts >= max_retries` again and send it straight back to `dead` — the command would be a no-op. Resetting the counter gives the retry a genuine fresh budget, which is the entire point of a person deciding to intervene.

## 4. Worker-stop signaling: alternatives considered

**What I went with: a PID file plus a direct OS signal.** `data/workers.json` tracks every running worker's PID (`registerWorkers`/`unregisterWorkers` in `workerManager.js`). `worker stop` reads that list and sends `SIGTERM` straight to each PID — the same signal `worker start`'s own Ctrl+C handler sends. That keeps the whole system down to one shutdown path instead of two that could drift out of sync. And because PIDs are global to the OS, this works no matter which terminal `worker stop` runs from.

**Considered and rejected — a control socket / IPC server.** Each `worker start` would need to open and manage a listening socket, and `worker stop` would need to discover and connect to it. That's a lot of extra machinery (port/path collisions, cross-terminal discovery) to reinvent something a plain OS signal already does natively.

**Also rejected — a polled "stop" flag in the JSON store.** A signal interrupts a process immediately, even mid-syscall. A flag only gets noticed the next time the worker's loop happens to check it — bounded by `POLL_INTERVAL_MS`, and not checked at all while a job is mid-`exec`. Sticking with signals also avoids running a second shutdown mechanism alongside the one Ctrl+C already relies on.

**Added after testing: escalating to `SIGKILL` if a worker won't die.** `SIGTERM` on its own only sets a `shuttingdown` flag (`worker.js`) — it never touches whatever command is currently running inside `exec()`. So a job with no `timeout_ms` that ignores `SIGTERM` would block shutdown forever. Both places that can trigger a shutdown — `stopWorkers` and `worker start`'s own Ctrl+C handler — now wait up to a shared `GRACEFUL_SHUTDOWN_TIMEOUT_MS` (10s, defined in `workerManager.js`) before force-killing anything still alive. `stopWorkers` does this by polling `isAlive` on the PIDs it signaled; `worker start` arms an equivalent timer, but only from inside its `shutdown()` handler, not as a timer that starts the moment the process launches. That distinction actually matters: an earlier version started the countdown at launch, which meant every `worker start` would kill its own children after 10 seconds whether or not anyone had asked it to stop. Manual testing caught that before it shipped.

**A limitation this escalation doesn't solve:** `SIGKILL`ing the worker process doesn't kill the shell process `exec()` spawned to actually run the job's command — signals don't cascade to child processes automatically on POSIX. So a force-killed worker can leave its job's command still running in the background, invisible to `queuectl`, while the job itself gets picked up again by `recoverStaleJobs` and retried elsewhere. For commands with side effects, that's a real risk of running the same thing twice. The correct fix is to run the job's command in its own process group (`{ detached: true }`) and signal the whole group (`-pid` instead of `pid`) on escalation — but that means moving off `promisify(exec)` in favor of something that hands back a live child handle, which I left out of scope here.

## 5. If priorities were added tomorrow, what survives / breaks?

**Survives untouched:** the locking layer — atomicity doesn't care what order jobs get processed in — along with `job.js`'s validation, `backoff.js`, `configStore.js`, DLQ semantics, and the PID-tracking/signaling behind worker-stop.

**Breaks:** `claimJob`'s eligibility scan (`jobStore.js:70`) is just `Array.find` over `Object.values(jobs)`, which is effectively insertion order. To honor priority, the collection would need to already be sorted or bucketed by priority before `claimJob` runs, so its existing predicate logic could keep working unchanged. `job.js`'s `validateJob`/`createJob` would also need a validated `priority` field with a sane default for jobs that don't specify one.

Worth flagging separately from priority itself: `claimJob` already reads and rewrites the *entire* `jobs.json` file on every single claim. That's fine at the scale a take-home runs at, but a full sort-and-scan on every claim would be the first cost that actually starts to matter as job counts grow.
