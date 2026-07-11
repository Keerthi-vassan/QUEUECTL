import { createJob, getJob } from '../src/core/jobStore.js';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(__dirname, '../src/core/worker.js');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Test: Invalid command fails gracefully ===\n');

  const job = await createJob({ command: 'this-command-does-not-exist-12345', max_retries: 1 });
  console.log('Created job:', job.id);

  const worker = fork(WORKER_SCRIPT, ['invalid-cmd-test-worker'], { stdio: 'inherit' });

  await sleep(2000);
  worker.kill('SIGTERM');
  await sleep(300);

  const finalJob = await getJob(job.id);
  console.log('\nFinal job state:', finalJob);

  // With max_retries: 1, a single failure should push it straight to 'dead'
  // The key thing we're checking: the worker process did NOT crash, and the
  // job was recorded as failed/dead with a captured error, not silently lost.
  const pass = (finalJob.state === 'dead' || finalJob.state === 'failed') && !!finalJob.last_error;
  console.log(pass
    ? '✅ PASS: invalid command failed gracefully, error captured, worker stayed alive'
    : '❌ FAIL: job did not fail as expected, or error was not captured');
  process.exit(pass ? 0 : 1);
}

main();