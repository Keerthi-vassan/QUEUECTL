import { listJobs, retryFromDLQ } from "../core/jobStore.js";

export function registerDlqCommand(program) {

    const dlqCommand = program.command('dlq').description('represents all the commands related to dead letter queue');

    dlqCommand
    .command('list')
    .description('lists out all the dead jobs in the persistent store either db or an file')
    .action(async () => { 
            let dead_jobs = await listJobs({state : 'dead'});    
            if(dead_jobs.length === 0) console.log("no jobs found");
            else{
                console.log(`Dead Jobs : `)
                dead_jobs.forEach( (dj) => {
                    console.log(`${dj.id.padEnd(10)} ${dj.command}`)
                }) 
            }

    });

    dlqCommand
    .command('retry <jobId>')
    .description('revives dead job by resetting its state to pending and attempts to 0')
    .action(async (jobId) => {
        try{
            let retried_job = await retryFromDLQ(jobId);
            console.log(`job ${jobId} is revived ,current state of it is ${retried_job.state}`)
        }catch(err){
            console.error(`Error : ${err.message}`);
            process.exit(1);
        }
    });

}

