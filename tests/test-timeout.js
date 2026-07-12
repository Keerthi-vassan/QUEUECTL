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
  console.log('=== Test: Job with timeout_ms gets killed and fails ===\n');

  // Command would run for 5s; timeout_ms fires well before that.
  const job = await createJob({ command: 'sleep 5', timeout_ms: 500, max_retries: 1 });
  console.log('Created job:', job.id, 'timeout_ms:', job.timeout_ms);

  const worker = fork(WORKER_SCRIPT, ['timeout-test-worker'], { stdio: 'inherit' });

  await sleep(2000);
  worker.kill('SIGTERM');
  await sleep(300);

  const finalJob = await getJob(job.id);
  console.log('\nFinal job state:', finalJob);

  const pass = (finalJob.state === 'dead' || finalJob.state === 'failed')
    && /timed out/i.test(finalJob.last_error || '');
  console.log(pass
    ? '✅ PASS: job timed out, was killed, and error was captured'
    : '❌ FAIL: job did not time out as expected');
  process.exit(pass ? 0 : 1);
}

main();
