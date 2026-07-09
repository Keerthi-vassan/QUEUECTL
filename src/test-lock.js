// test-lock.js — temporary, delete once you trust lock.js
import { acquireLock, releaseLock, sleep } from './core/lock.js';

async function fakeWorker(name) {
  console.log(`${name}: trying to acquire lock...`);
  await acquireLock();
  console.log(`${name}: GOT the lock`);
  await sleep(200); // pretend to do work
  console.log(`${name}: releasing lock`);
  await releaseLock();
}

// Launch two "workers" at the same time
await Promise.all([
  fakeWorker('Worker-A'),
  fakeWorker('Worker-B'),
]);