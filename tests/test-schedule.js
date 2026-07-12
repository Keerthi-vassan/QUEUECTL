import { createJob, getJob, claimJob } from '../src/core/jobStore.js';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Test: run_at delays a pending job until it elapses ===\n');

  const future = new Date(Date.now() + 1500).toISOString();
  const scheduled = await createJob({ command: 'echo scheduled', run_at: future });
  const immediate = await createJob({ command: 'echo immediate' });
  console.log('Created scheduled job:', scheduled.id, 'run_at:', scheduled.run_at);
  console.log('Created immediate job:', immediate.id);

  // Before run_at elapses: only the immediate job should be claimable.
  const firstClaim = await claimJob('schedule-test-worker');
  console.log('First claim (before run_at):', firstClaim?.id);
  const firstClaimOk = firstClaim?.id === immediate.id;

  // Nothing else is eligible yet - a second claim attempt should come back empty.
  const secondClaim = await claimJob('schedule-test-worker');
  console.log('Second claim (still before run_at, nothing else pending):', secondClaim);
  const secondClaimOk = secondClaim === null;

  await sleep(1700);

  // After run_at elapses: the scheduled job becomes claimable.
  const thirdClaim = await claimJob('schedule-test-worker');
  console.log('Third claim (after run_at elapsed):', thirdClaim?.id);
  const thirdClaimOk = thirdClaim?.id === scheduled.id;

  const pass = firstClaimOk && secondClaimOk && thirdClaimOk;
  console.log(pass
    ? '✅ PASS: scheduled job stayed ineligible until run_at, then got claimed'
    : '❌ FAIL: run_at eligibility did not behave as expected');
  process.exit(pass ? 0 : 1);
}

main();
