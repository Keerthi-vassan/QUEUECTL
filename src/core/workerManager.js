import { readFile, writeFile } from 'fs/promises';
import { acquireLock, releaseLock, sleep } from './lock.js';

export const WORKER_SCRIPT = './src/core/worker.js';

// How long to wait for a SIGTERM'd worker to exit on its own (e.g. finishing an
// in-flight job) before escalating to SIGKILL. Shared by `worker stop` and
// `worker start`'s own Ctrl+C handler so both escalate on the same deadline.
export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;
const STOP_POLL_INTERVAL_MS = 200;

const WORKERS_PATH = './data/workers.json';
const WORKERS_LOCK_PATH = './data/workers.json.lock';

async function readWorkersFile() {
  try {
    const fd = await readFile(WORKERS_PATH, 'utf8');
    let obj = JSON.parse(fd);
    return obj;
  } catch (err) {
    if (err.code === 'ENOENT') return { workers: [] };
    else throw err;
  }
}

async function writeWorkersFile(data) {
  try {
    let updated_workers = JSON.stringify(data, null, 2);
    await writeFile(WORKERS_PATH, updated_workers);
  } catch (err) {
    throw err;
  }
}

function isAlive(pid) {
  try {
    // signal 0 doesn't actually send a signal, just checks the pid is signalable
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

export async function registerWorkers(pids) {
  await acquireLock(WORKERS_LOCK_PATH);
  try {
    let obj = await readWorkersFile();
    let workers = [...obj.workers, ...pids];
    await writeWorkersFile({ workers });
  } finally {
    await releaseLock(WORKERS_LOCK_PATH);
  }
}

export async function unregisterWorkers(pids) {
  await acquireLock(WORKERS_LOCK_PATH);
  try {
    let obj = await readWorkersFile();
    let workers = obj.workers.filter((pid) => !pids.includes(pid));
    await writeWorkersFile({ workers });
  } finally {
    await releaseLock(WORKERS_LOCK_PATH);
  }
}

// Reads the tracked PIDs, filters out ones that are no longer running (e.g. left
// behind by a crash that skipped cleanup), and self-heals the file to match.
export async function getActiveWorkerPids() {
  await acquireLock(WORKERS_LOCK_PATH);
  let alive;
  try {
    let obj = await readWorkersFile();
    alive = obj.workers.filter(isAlive);
    if (alive.length !== obj.workers.length) {
      await writeWorkersFile({ workers: alive });
    }
  } finally {
    await releaseLock(WORKERS_LOCK_PATH);
  }
  return alive;
}

export async function stopWorkers() {
  await acquireLock(WORKERS_LOCK_PATH);
  let signaled = [];
  try {
    let obj = await readWorkersFile();
    let workers = obj.workers;

    workers.forEach((pid) => {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`worker ${pid} signaled to stop`);
        signaled.push(pid);
      } catch (err) {
        if (err.code === 'ESRCH') {
          console.log(`worker ${pid} is already stopped`);
        } else {
          console.log(`failed to signal terminate to worker ${pid}: ${err.message}`);
        }
      }
    });

    await writeWorkersFile({ workers: [] });
  } finally {
    await releaseLock(WORKERS_LOCK_PATH);
  }

  // Poll outside the lock (this can take up to GRACEFUL_SHUTDOWN_TIMEOUT_MS -
  // no reason to block other workers.json operations while we wait). Anything
  // still alive after the deadline (e.g. stuck in a job with no timeout_ms
  // that's ignoring SIGTERM) gets force-killed directly.
  const deadline = Date.now() + GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  let stillAlive = signaled.filter(isAlive);
  while (stillAlive.length > 0 && Date.now() < deadline) {
    await sleep(STOP_POLL_INTERVAL_MS);
    stillAlive = stillAlive.filter(isAlive);
  }

  for (const pid of stillAlive) {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(`worker ${pid} did not exit within ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms, force-killed`);
    } catch (err) {
      // already exited between the last isAlive check and here
    }
  }

  return signaled.length;
}
