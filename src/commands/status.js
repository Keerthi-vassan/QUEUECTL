import { listJobs } from '../core/jobStore.js';
import { getActiveWorkerPids } from '../core/workerManager.js';

export function registerStatusCommand(program) {
  program
    .command('status')
    .description('Show summary of all job states & active workers')
    .action(async () => {
      const jobs = await listJobs();

        let stat = jobs.reduce((jobStat , job) => {
            jobStat[job.state]++;
            return jobStat;
        }, { pending : 0 , processing : 0 , completed : 0 , failed : 0 , dead : 0 , total : jobs.length});

        const activeWorkers = await getActiveWorkerPids();
        stat.active_workers = activeWorkers.length;

        console.log(stat);

    });
}