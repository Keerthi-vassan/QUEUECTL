import { listJobs } from "../core/jobStore.js";

export function registerListCommand(program) {
  program
    .command("list")
    .description("List jobs, optionally filtered by state")
    .option( "-s, --state <state>", "filter by job state (pending, processing, completed, failed, dead)",)
    .action(async (options) => {
      let jobs = await listJobs({state : options.state});
      if (jobs.length === 0) console.log("no jobs found");
      else {
        jobs.forEach((j) => {
          console.log(` ${j.id} ${j.state.padEnd(10)} ${j.command} `);
        });
      }
    });
}
