import { createJob, claimJob, getJob } from '../src/core/jobStore.js';

async function seed() {
  await createJob({ command: 'echo job-A' });
  await createJob({ command: 'echo job-B' });
  await createJob({ command: 'echo job-C' });
}

async function fakeWorker(name) {
  const job = await claimJob(name);
  if (job) {
    console.log(`${name} claimed: ${job.id} (${job.command})`);
  } else {
    console.log(`${name} got nothing (no pending jobs left)`);
  }
  return job;
}

async function main() {
  console.log('=== Test: Concurrent claim safety ===\n');
  await seed();

  const results = await Promise.all([
    fakeWorker('Worker-1'),
    fakeWorker('Worker-2'),
    fakeWorker('Worker-3'),
    fakeWorker('Worker-4'),
    fakeWorker('Worker-5'),
  ]);

  const claimedIds = results.filter(Boolean).map(j => j.id);
  const uniqueIds = new Set(claimedIds);

  console.log('\n--- Summary ---');
  console.log(`Jobs claimed: ${claimedIds.length}`);
  console.log(`Unique job ids: ${uniqueIds.size}`);
  const pass = claimedIds.length === uniqueIds.size;
  console.log(pass ? '✅ PASS: no duplicate claims' : '❌ FAIL: duplicate claim detected!');
  process.exit(pass ? 0 : 1);
}

main();