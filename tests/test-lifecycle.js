import { createJob, claimJob, failJob, getJob } from '../src/core/jobStore.js';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Test: Full lifecycle pending -> failed -> dead ===\n');

  const job = await createJob({ command: 'exit 1', max_retries: 2 });
  console.log('Created:', job.id, '| state:', job.state, '| attempts:', job.attempts);

  let current = job;
  let round = 1;

  while (current.state !== 'dead' && current.state !== 'completed') {
    const claimed = await claimJob('test-worker');

    if (!claimed) {
      console.log(`Round ${round}: nothing claimable right now (likely waiting on backoff) — stopping test loop early`);
      break;
    }

    console.log(`Round ${round}: claimed ${claimed.id} | state: ${claimed.state}`);

    current = await failJob(claimed.id, 'simulated failure: exit code 1');
    console.log(
      `Round ${round}: after failJob -> state: ${current.state}, attempts: ${current.attempts}/${current.max_retries}, next_attempt: ${current.next_attempt ?? 'n/a'}`
    );

    round++;
    if (round > 10) {
      console.log('Safety stop: too many rounds, something is probably wrong');
      break;
    }

    if (current.state !== 'dead' && current.state !== 'completed' && current.next_attempt) {
      const waitMs = Math.max(0, new Date(current.next_attempt).getTime() - Date.now()) + 200;
      console.log(`   (waiting ${waitMs}ms for backoff window to elapse...)`);
      await sleep(waitMs);
    }
  }

  console.log('\n--- Final state ---');
  const final = await getJob(job.id);
  console.log(final);

  const pass = final.state === 'dead';
  console.log(pass ? '✅ PASS: job correctly moved to DLQ after exhausting retries' : '❌ FAIL: job did not reach dead state as expected');
  process.exit(pass ? 0 : 1);
}

main();