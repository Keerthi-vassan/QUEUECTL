import { acquireLock,releaseLock } from "./lock.js";
import { createJob as buildJob } from "./job.js";
import {readFile ,writeFile} from "fs/promises"

const data_path = './data/jobs.json'

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
    try{
        let jobs = await readJobsFile();
        let jobsList = Object.values(jobs);

        let currJob = jobsList.find(job => job.state === 'pending');

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