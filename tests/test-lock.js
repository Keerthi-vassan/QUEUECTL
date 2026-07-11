import { acquireLock, releaseLock, sleep } from '../src/core/lock.js';

const TEST_LOCK_PATH = './data/test-lock.lock';

async function fakeWorker(name, log) {
  log.push(`${name}: trying to acquire lock...`);
  await acquireLock(TEST_LOCK_PATH);
  log.push(`${name}: GOT the lock`);
  await sleep(200);
  log.push(`${name}: releasing lock`);
  await releaseLock(TEST_LOCK_PATH);
}

async function main() {
  console.log('=== Test: Lock mutual exclusion ===\n');
  const log = [];

  await Promise.all([
    fakeWorker('Worker-A', log),
    fakeWorker('Worker-B', log),
  ]);

  log.forEach(line => console.log(line));

  const gotIndexA = log.findIndex(l => l.startsWith('Worker-A: GOT'));
  const gotIndexB = log.findIndex(l => l.startsWith('Worker-B: GOT'));
  const relIndexA = log.findIndex(l => l.startsWith('Worker-A: releasing'));
  const relIndexB = log.findIndex(l => l.startsWith('Worker-B: releasing'));

  const noOverlap =
    (gotIndexA < relIndexA && (gotIndexB < gotIndexA || gotIndexB > relIndexA)) ||
    (gotIndexB < relIndexB && (gotIndexA < gotIndexB || gotIndexA > relIndexB));

  console.log(noOverlap ? '\n✅ PASS: lock enforced mutual exclusion' : '\n❌ FAIL: possible overlap detected');
  process.exit(noOverlap ? 0 : 1);
}

main();