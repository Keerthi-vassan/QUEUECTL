import { fork } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { acquireLock, releaseLock } from './lock.js';

const WORKERS_PATH = './data/workers.json';
const WORKERS_LOCK_PATH = './data/workers.json.lock';
const WORKER_SCRIPT = './src/core/worker.js';

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

export async function startWorkers(count) {
  await acquireLock(WORKERS_LOCK_PATH);
  let workers;
  let new_workers = []
  try {
    let obj = await readWorkersFile();
    workers = obj.workers;

    for (let i = 0; i < count; i++) {
      let child = fork(WORKER_SCRIPT, [`worker-${i}-${Date.now()}`], { detached: true, stdio: 'ignore' });
      workers.push(child.pid);
      new_workers.push(child.pid);
      child.unref();
      child.disconnect();
    }

    await writeWorkersFile({ workers });
  } finally {
    await releaseLock(WORKERS_LOCK_PATH);
  }
  return new_workers;
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