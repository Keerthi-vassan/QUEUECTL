import { createJob, getJob, claimJob, failJob, completeJob, retryFromDLQ } from '../src/core/jobStore.js';

async function main() {
  console.log('=== Test: per-attempt history survives failures and a DLQ retry ===\n');

  const job = await createJob({ command: 'exit 1', max_retries: 1 });
  console.log('Created:', job.id);

  await claimJob('history-test-worker');
  await failJob(job.id, 'first failure', 'stderr from attempt 1');
  const afterFirstFail = await getJob(job.id);
  console.log('After 1st failure -> state:', afterFirstFail.state, '| history length:', afterFirstFail.history.length);

  // max_retries: 1, so this single failure should already be dead.
  const deadOk = afterFirstFail.state === 'dead'
    && afterFirstFail.history.length === 1
    && afterFirstFail.history[0].attempt === 1
    && afterFirstFail.history[0].error === 'first failure';

  await retryFromDLQ(job.id);
  const afterRetry = await getJob(job.id);
  console.log('After DLQ retry -> state:', afterRetry.state, '| history length:', afterRetry.history.length);
  const retryMarkedOk = afterRetry.state === 'pending'
    && afterRetry.history.length === 2
    && afterRetry.history[1].state === 'retried';

  await claimJob('history-test-worker');
  await completeJob(job.id, 'succeeded this time');
  const final = await getJob(job.id);
  console.log('After completion -> state:', final.state, '| history length:', final.history.length);
  console.log('Full history:', JSON.stringify(final.history, null, 2));

  const completeOk = final.state === 'completed'
    && final.history.length === 3
    && final.history[2].state === 'completed'
    && final.history[2].attempt === 1; // attempts was reset to 0 by the DLQ retry

  const pass = deadOk && retryMarkedOk && completeOk;
  console.log(pass
    ? '✅ PASS: history captured attempt 1 failure, the retry boundary, and the final success'
    : '❌ FAIL: history did not track the full fail -> retry -> complete cycle correctly');
  process.exit(pass ? 0 : 1);
}

main();
