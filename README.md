# queuectl

A CLI-based background job queue system. Manages background jobs across worker
processes, retries failures with exponential backoff, and maintains a Dead
Letter Queue (DLQ) for jobs that exhaust their retries. State is persisted as
flat JSON files with cross-process file locking — no daemon, no database.

See `PRD.md` for the original spec and `DECISIONS.md` for the design rationale
behind the concurrency/recovery/DLQ choices below.

## Setup

Requires Node.js (built and tested on v22).

```bash
npm install
npm link   # makes the `queuectl` command available on your PATH
```

`npm link` is optional — every command below also works as
`node bin/queuectl.js <command>` if you'd rather not link it globally.

## Usage

### Enqueue a job

```bash
queuectl enqueue '{"command":"echo Hello World"}'
queuectl enqueue '{"id":"job1","command":"sleep 2","max_retries":5}'
```

`id` and `max_retries` are optional — `id` defaults to a generated UUID,
`max_retries` defaults to the configured `max-retries` value.

### Run workers

```bash
queuectl worker start            # 1 worker, foreground
queuectl worker start --count 3  # 3 workers, foreground
```

Runs in the foreground and blocks until stopped. `Ctrl+C` (or `SIGTERM`)
triggers a graceful shutdown: each worker finishes its current job, then exits.
If a worker doesn't exit within 10 seconds (e.g. stuck running a command with
no `timeout_ms` that isn't responding to `SIGTERM`), it's force-killed —
shutdown always completes, but a force-killed job is left stuck in
`processing` until stale-job recovery routes it back through a retry (see
`DECISIONS.md` Q2 and Q4).

From a **different terminal**, while workers are running:

```bash
queuectl worker stop
```

Signals every currently-tracked worker to shut down gracefully, waiting up to
10 seconds per worker before force-killing anything still running. The
terminal running `worker start` will print the shutdown sequence and exit on
its own once all workers have stopped.

### Check status

```bash
queuectl status
# { pending: 1, processing: 0, completed: 4, failed: 0, dead: 1, total: 6, active_workers: 2 }
```

### List jobs

```bash
queuectl list                        # all jobs, human-readable
queuectl list --state pending        # filter by state
queuectl list --state pending --json # JSON array on stdout, nothing else
```

Valid states: `pending`, `processing`, `completed`, `failed`, `dead`.

### Dead Letter Queue

```bash
queuectl dlq list
queuectl dlq retry job1   # re-enqueues a dead job with attempts reset to 0
```

### Configuration

```bash
queuectl config get
queuectl config get max-retries
queuectl config set max-retries 5
queuectl config set backoff-base 2
queuectl config set stale-job-timeout-ms 45000
```

Config changes only affect jobs evaluated *after* the change — jobs that
already have a scheduled `next_attempt`, or an already-set `max_retries`,
keep the values they were created/failed with.

## Architecture overview

- **Persistence**: flat JSON files in `data/` (`jobs.json`, `config.json`,
  `workers.json`), gitignored and recreated on demand. No long-running server —
  every CLI invocation and every worker read/modify/write cycle acquires an
  exclusive lock file, reads the JSON file fully, mutates, writes the whole
  file back, and releases the lock.
- **Locking** (`src/core/lock.js`): `acquireLock` does an exclusive-create
  (`open(path, 'wx')`), atomic at the OS level even across separate processes —
  this is what makes claiming a job safe against two workers grabbing it at
  once. See `DECISIONS.md` Q1 for the exact mechanics.
- **Job lifecycle**: `pending → processing → completed`, or
  `pending → processing → failed → (retry, after a backoff delay) → processing → ...`
  until `attempts >= max_retries`, at which point the job moves to `dead` (the
  DLQ).
- **Workers are separate OS processes**, not threads. `src/core/worker.js` is a
  standalone script; `queuectl worker start` forks one child process per
  worker and stays in the foreground itself, forwarding `SIGINT`/`SIGTERM` to
  its children and blocking until they've all exited — see `DECISIONS.md` Q4
  for why PID-file + signal was chosen over alternatives for `worker stop`.
- **Crash recovery**: each worker's poll loop periodically checks for jobs
  stuck in `processing` past `stale_job_timeout_ms` and routes them back
  through the normal retry/backoff path. See `DECISIONS.md` Q2 for the full
  walkthrough and worst-case timing.

## Testing

### Automated

```bash
bash tests/run-all.sh
```

Runs the full suite: lock mutual exclusion, concurrent claim safety, a basic
job completing, invalid-command handling, the full pending→failed→dead
lifecycle, job timeouts (`timeout_ms` killing a long-running command),
scheduled jobs (`run_at` delaying eligibility), and per-attempt history
surviving a fail → DLQ retry → complete cycle. Cleans `data/*.json` between
each test and stops on first failure. Individual tests can also be run
directly, e.g. `node tests/test-basic.js` or `node tests/test-timeout.js`.

### Manual scenarios

A few scenarios need real OS processes / multiple terminals and don't automate
cleanly, so they're documented here instead:

**1. Restart persistence**

```bash
queuectl enqueue '{"command":"echo persisted"}'
queuectl list --json   # note the job's id and state
# no workers running — just confirm the state survives a fresh CLI invocation
queuectl list --json   # same job, same state, read fresh from data/jobs.json
```

**2. SIGKILL crash recovery**

```bash
# terminal A
queuectl config set stale-job-timeout-ms 10000   # shorten the wait for this test
queuectl enqueue '{"command":"sleep 30"}'
queuectl worker start --count 2

# terminal B, once the job shows "processing" in `queuectl list --json`:
ps aux | grep 'src/core/worker.js'   # find the PID of the worker running the job
kill -9 <that worker's pid>

# terminal B, watch it recover:
watch -n1 'queuectl list --json'
# the job leaves "processing" within stale-job-timeout-ms (+ a few seconds),
# gets a retry scheduled, and completes once the surviving worker picks it back up
```

**3. Multi-terminal graceful `worker stop`**

```bash
# terminal A
queuectl worker start --count 2
# stays in the foreground, printing each job it picks up

# terminal B
queuectl worker stop

# back in terminal A: prints the graceful-shutdown sequence for each worker,
# then "All workers stopped." and exits on its own
```

## Demo recording

TODO: add a link to a short CLI demo recording here before submitting.
