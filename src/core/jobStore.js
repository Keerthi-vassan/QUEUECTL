import { acquireLock,releaseLock } from "./lock.js";
import { createJob as buildJob } from "./job.js";
import {readFile ,writeFile} from "fs/promises"
import { nextAttemptTimestamp } from "./backoff.js";
import { getConfig } from "./configStore.js";

const data_path = './data/jobs.json';
const JOBS_LOCK_PATH = './data/jobs.json.lock'

async function readJobsFile() {

    try{
        let fd = await readFile(data_path,'utf8');
        let jobs = JSON.parse(fd);
    
        return jobs;
    }catch(err){
        if(err.code === 'ENOENT') return {}; 
        else throw err;
    }

}

async function writeJobsFile(jobs){
    try{ 
        let new_jobs = JSON.stringify(jobs,null,2);
        await writeFile(data_path,new_jobs);
    }catch(err){
        throw  err;
    }
}

export async function createJob(input) {
   await acquireLock(JOBS_LOCK_PATH);
   let new_job;
   try{
        new_job =  await buildJob(input);
        let jobs = await readJobsFile();
        
        let new_jobs = {...jobs, [new_job.id] : new_job};

        await writeJobsFile(new_jobs)

   }finally{
        await releaseLock(JOBS_LOCK_PATH);
   } 

   return new_job;
}

export async function getJob(id) {
    await acquireLock(JOBS_LOCK_PATH);
    try{
        let jobs = await readJobsFile();
        return jobs[id] ?? null;
    }finally{
        await releaseLock(JOBS_LOCK_PATH);
    }
}


export async function claimJob(workerId){
    await acquireLock(JOBS_LOCK_PATH);
    let claimedJob = null;
    const now = Date.now();
    try{
        let jobs = await readJobsFile();
        let jobsList = Object.values(jobs);

        let currJob = jobsList.find(job => job.state === 'pending' || job.state ==='failed' && new Date(job.next_attempt).getTime()  <= now);

        if(!currJob) return null;

        currJob.state = 'processing';
        currJob.updated_at = new Date().toISOString();
        currJob.worker_id = workerId;

        claimedJob = currJob;
        await writeJobsFile(jobs);
    }finally{
        await releaseLock(JOBS_LOCK_PATH);
    }

    return claimedJob;
}

export async function completeJob(id, output){
    await acquireLock(JOBS_LOCK_PATH);
    let job = null;
    try{
        let jobs = await readJobsFile();
        job = jobs[id];
        if(!job) throw new Error(`Job ${id} not found`)
            

        job.state = 'completed';
        job.updated_at = new Date().toISOString();

        if(output !== undefined){
            job.output = output;
        }


        let new_jobs = {...jobs , [job.id] : job};
        await writeJobsFile(new_jobs);
    }finally{
        await releaseLock(JOBS_LOCK_PATH);
    }

    return job;
}

export async function failJob(id , errorMessage, output){
    let config = await getConfig();
    await acquireLock(JOBS_LOCK_PATH);
    let job = null;
    const base = config.backoff_base;
    try{
        let jobs = await readJobsFile()
        job = jobs[id];
        if(!job) throw new Error(`Job ${id} not found`)
        
        job.attempts++;

        if(job.attempts >= job.max_retries) {
            job.state = 'dead';
        }else{
            job.state = 'failed';
            job.next_attempt = nextAttemptTimestamp(job.attempts , base);
        }

        job.updated_at = new Date().toISOString();
        job.last_error = errorMessage;

        if (output !== undefined) {
            job.output = output;
        }

        let new_jobs = {...jobs , [job.id] : job};
        await writeJobsFile(new_jobs);
    }finally{
        await releaseLock(JOBS_LOCK_PATH);
    }

    return job;
}

export async function listJobs({ state } = {}) {
  await acquireLock(JOBS_LOCK_PATH);
  try {
    const jobs = await readJobsFile();
    const all = Object.values(jobs);
    let jobList;
    if(state){
        jobList = all.filter(j => j.state === state);
    }else{
        jobList = all;
    }
    return jobList;
  } finally {
    await releaseLock(JOBS_LOCK_PATH);
  }
}

export async function retryFromDLQ(id) {
  await acquireLock(JOBS_LOCK_PATH);
  let job = null;
  try {
    let jobs = await readJobsFile();
    job = jobs[id];
    if (!job) throw new Error(`Job ${id} not found`);
    if(job.state !== 'dead') throw new Error(`the job ${id} is not dead yet : (current_state : ${job.state})`);
    job.state = 'pending';
    job.attempts = 0;
    delete job.next_attempt;
    job.updated_at = new Date().toISOString();
    
    await writeJobsFile(jobs);
  } finally {
    await releaseLock(JOBS_LOCK_PATH);
  }
  return job;
}

export async function recoverStaleJobs() {
  const config = await getConfig();
  const timeoutMs = config.stale_job_timeout_ms;
  const now = Date.now();

  const processingJobs = await listJobs({ state: 'processing' });

  const staleJobs = processingJobs.filter(job => {
    const age = now - new Date(job.updated_at).getTime();
    return age > timeoutMs;
  });

  const recovered = [];
  for (const job of staleJobs) {
    const updated = await failJob(
      job.id,
      `Job abandoned: no update for over ${timeoutMs}ms, worker likely crashed`
    );
    recovered.push(updated);
  }

  return recovered;
}