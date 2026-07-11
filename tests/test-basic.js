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
  console.log('=== Test: Basic job completes successfully ===\n');

  const job = await createJob({ command: 'echo basic-test-output' });
  console.log('Created job:', job.id);

  const worker = fork(WORKER_SCRIPT, ['basic-test-worker'], { stdio: 'inherit' });

  await sleep(2000);
  worker.kill('SIGTERM');
  await sleep(300); // give it a moment to shut down cleanly

  const finalJob = await getJob(job.id);
  console.log('\nFinal job state:', finalJob);

  const pass = finalJob.state === 'completed' && finalJob.output === 'basic-test-output';
  console.log(pass ? '\n✅ PASS: job completed with correct output' : '\n❌ FAIL: job did not complete as expected');
  process.exit(pass ? 0 : 1);
}

main();