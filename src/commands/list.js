import { listJobs } from "../core/jobStore.js";

export function registerListCommand(program) {
  program
    .command("list")
    .description("List jobs, optionally filtered by state")
    .option( "-s, --state <state>", "filter by job state (pending, processing, completed, failed, dead)",)
    .option( "--json", "print a JSON array of job objects to stdout (nothing else on stdout)")
    .action(async (options) => {
      let jobs = await listJobs({state : options.state});

      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2));
        return;
      }

      if (jobs.length === 0) console.log("no jobs found");
      else {
        const idWidth = Math.max(...jobs.map((j) => j.id.length));
        jobs.forEach((j) => {
            if(j.workerId){
                console.log(` ${j.id.padEnd(idWidth)}     ${j.state.padEnd(10)}   ${j.command}   ${j.workerId}`);
            }else{
                console.log(` ${j.id.padEnd(idWidth)}     ${j.state.padEnd(10)}   ${j.command}`);
            }
        });
      }
    });
}
