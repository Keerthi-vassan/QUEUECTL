import { promisify } from "util";
import { exec as execCallback } from "child_process";
import { claimJob, completeJob, failJob, recoverStaleJobs } from "./jobStore.js";

const exec = promisify(execCallback);

const workerId = process.argv[2] ?? `worker-${process.pid}`;
const POLL_INTERVAL_MS = 1000; // how long to wait before re-polling when no job is available
const RECOVERY_CHECK_INTERVAL_MS = 5000; // how often to check for stale/abandoned jobs

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJob(job) {
    console.log(`running job`);
    console.log(` id : ${job.id} , command : ${job.command} , status : ${job.state}`);
    try {
        let res = await exec(job.command);
        await completeJob(job.id , res.stdout.trim());
    } catch (err) {
        await failJob(job.id, err.message, err.stderr?.trim());
    }
    
    console.log(`finished processing job ${job.id}`);
}

let shuttingdown = false;

function handleShutdown(signal){
    console.log(`[${workerId}] recieved a ${signal} , will exit after the current job finishes processing...`);
    shuttingdown = true
}

process.on('SIGTERM' , () => handleShutdown('SIGTERM'));
process.on('SIGINT' , () => handleShutdown('SIGINT'));

async function mainLoop() {
  console.log(`[${workerId}] started, polling for jobs...`);

  // 0 forces a recovery check on the first loop iteration (same as the old
  // startup-only check), then throttled to RECOVERY_CHECK_INTERVAL_MS after that
  // so it doesn't cost a jobs.json lock on every single poll/claim cycle.
  let lastRecoveryCheck = 0;

  while (!shuttingdown) {
    if (Date.now() - lastRecoveryCheck >= RECOVERY_CHECK_INTERVAL_MS) {
      lastRecoveryCheck = Date.now();
      const recovered = await recoverStaleJobs();
      if (recovered.length > 0) {
        console.log(`[${workerId}] recovered ${recovered.length} stale job(s) : ${recovered.map(j => j.id).join(', ')}`);
      }
    }

    const job = await claimJob(workerId);

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    await runJob(job);
  }

  console.log(`[${workerId}] shut down cleanly`);
  process.exit(0);
}

mainLoop();
