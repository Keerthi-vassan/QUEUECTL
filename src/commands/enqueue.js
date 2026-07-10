import { createJob } from '../core/jobStore.js';

export function registerEnqueueCommand(program) {
  program
    .command('enqueue <jobJson>')
    .description('Add a new job to the queue')
    .action(async (jobJson) => {
        try{
            let input = JSON.parse(jobJson);
            const job =  await createJob(input);
            console.log(`enqueued the job , id : ${job.id} , command : ${job.command}`);
        }catch(err){
            console.error(`Error : ${err.message}`) ;
            process.exit(1);
        }
    });
}