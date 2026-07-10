import { promisify } from "util";
import { exec as execCallback } from "child_process";
import { claimJob, completeJob, failJob } from "./jobStore.js";

const exec = promisify(execCallback);

const workerId = process.argv[2] ?? `worker-${process.pid}`;
const POLL_INTERVAL_MS = 1000; // how long to wait before re-polling when no job is available

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJob(job) {
  console.log(`running job`);
  console.log(`${job.id} , command : ${job.command} , status : ${job.state}`);
  try {
    let res = await exec(job.command);
    await completeJob(job.id , res.stdout.trim());
  } catch (err) {
    await failJob(job.id, err.message, err.stderr?.trim());
  }

  console.log(`finished processing job ${job.id}`);
}

async function mainLoop() {
  console.log(`[${workerId}] started, polling for jobs...`);

  while (true) {
    // TODO: replace with a condition tied to shutdown signal, next step
    const job = await claimJob(workerId);

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    await runJob(job);
  }
}

mainLoop();
