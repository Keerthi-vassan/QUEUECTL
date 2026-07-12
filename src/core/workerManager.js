import { readFile, writeFile } from 'fs/promises';
import { acquireLock, releaseLock } from './lock.js';

export const WORKER_SCRIPT = './src/core/worker.js';

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
  let count = 0;
  try {
    let obj = await readWorkersFile();
    let workers = obj.workers;

    workers.forEach((pid) => {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`worker ${pid} killed`);
        count++;
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
  return count;
}
