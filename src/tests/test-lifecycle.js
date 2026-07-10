// test-lifecycle.js — temporary, run then delete once trusted
import { createJob, claimJob, failJob, getJob } from '../core/jobStore.js';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // Job with max_retries: 2, so it should take exactly 3 total attempts before DLQ
  const job = await createJob({ command: 'exit 1', max_retries: 2 });
  console.log('Created:', job.id, '| state:', job.state, '| attempts:', job.attempts);

  let current = job;
  let round = 1;

  while (current.state !== 'dead' && current.state !== 'completed') {
    // Simulate a worker claiming the job
    const claimed = await claimJob('test-worker');

    if (!claimed) {
      console.log(`Round ${round}: nothing claimable right now (likely waiting on backoff) — stopping test loop early`);
      break;
    }

    console.log(`Round ${round}: claimed ${claimed.id} | state: ${claimed.state}`);

    // Simulate the command failing
    current = await failJob(claimed.id, 'simulated failure: exit code 1');
    console.log(
      `Round ${round}: after failJob -> state: ${current.state}, attempts: ${current.attempts}/${current.max_retries}, next_attempt: ${current.next_attempt ?? 'n/a'}`
    );

    round++;
    if (round > 10) {
      console.log('Safety stop: too many rounds, something is probably wrong');
      break;
    }

    // If the job isn't dead/completed yet, wait until its backoff window elapses
    // before the next claim attempt, so the retry path actually gets exercised.
    if (current.state !== 'dead' && current.state !== 'completed' && current.next_attempt) {
      const waitMs = Math.max(0, new Date(current.next_attempt).getTime() - Date.now()) + 200;
      console.log(`   (waiting ${waitMs}ms for backoff window to elapse...)`);
      await sleep(waitMs);
    }
  }

  console.log('\n--- Final state ---');
  const final = await getJob(job.id);
  console.log(final);

  console.log(
    final.state === 'dead'
      ? '✅ PASS: job correctly moved to DLQ after exhausting retries'
      : '❌ Job did not reach dead state as expected'
  );
}

main();