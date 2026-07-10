import { acquireLock,releaseLock } from "./lock.js";
import { createJob as buildJob } from "./job.js";
import {readFile ,writeFile} from "fs/promises"
import { nextAttemptTimestamp } from "./backoff.js";

const data_path = './data/jobs.json';

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
   await acquireLock();
   let new_job;
   try{
        new_job =  buildJob(input);
        let jobs = await readJobsFile();
        
        let new_jobs = {...jobs, [new_job.id] : new_job};

        await writeJobsFile(new_jobs)

   }finally{
        await releaseLock();
   } 

   return new_job;
}

export async function getJob(id) {
    await acquireLock();
    try{
        let jobs = await readJobsFile();
        return jobs[id] ?? null;
    }finally{
        await releaseLock();
    }
}


export async function claimJob(workerId){
    await acquireLock();
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
        await releaseLock();
    }

    return claimedJob;
}

export async function completeJob(id, output){
    await acquireLock();
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
        await releaseLock();
    }

    return job;
}

export async function failJob(id , errorMessage, output){
    await acquireLock();
    let job = null;
    const base = 2;
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
        await releaseLock();
    }

    return job;
}

export async function listJobs({ state } = {}) {
  await acquireLock();
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
    await releaseLock();
  }
}

export async function retryFromDLQ(id) {
  await acquireLock();
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
    await releaseLock();
  }
  return job;
}