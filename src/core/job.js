import { randomUUID } from "crypto";
import { getConfig } from "./configStore.js";

let possible_states = ["pending", "processing", "completed" , "failed", "dead"];

export async function createJob(input){
    if(!input.command) throw new Error("command is not found");
    
    if(!input.id) input.id = randomUUID();
    if(input.max_retries === undefined){
        let config = await getConfig();
        input.max_retries = config.max_retries;
    } 


    let job = {
        ...input,
        state : "pending" ,
        attempts : 0,
        created_at : new Date().toISOString(),
        updated_at : new Date().toISOString(),
    };

    validateJob(job);

    return job;
}

export function validateJob(job){
    if (typeof job.command !== 'string' || job.command.trim() === '') throw new Error("invalid command ");
    if (typeof job.attempts !== 'number' || job.attempts < 0 ) throw new Error("invalid job attempts")
    if(typeof job.max_retries !== 'number' || job.max_retries < 0) throw new Error("max no. of entries is negative");
    if(!possible_states.includes(job.state)) throw new Error("invalid job state");
    if(job.timeout_ms !== undefined && (typeof job.timeout_ms !== 'number' || job.timeout_ms <= 0)) throw new Error("invalid job timeout_ms");



    return true;
}
