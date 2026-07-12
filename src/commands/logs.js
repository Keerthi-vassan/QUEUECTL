import { getJob } from "../core/jobStore.js";

export function registerLogsCommand(program) {
  program
    .command("logs <jobId>")
    .description("show the per-attempt output/error history for a job")
    .option("--json", "print the raw history array as JSON")
    .action(async (jobId, options) => {
      const job = await getJob(jobId);
      if (!job) {
        console.error(`Error: job ${jobId} not found`);
        process.exit(1);
      }

      const history = job.history ?? [];

      if (options.json) {
        console.log(JSON.stringify(history));
        return;
      }

      if (history.length === 0) {
        console.log(`no attempt history yet for job ${jobId} (state: ${job.state})`);
        return;
      }

      console.log(`History for job ${jobId} (current state: ${job.state}):`);
      history.forEach((entry) => {
        if (entry.state === 'retried') {
          console.log(`  [${entry.at}] retried from DLQ - attempts reset`);
          return;
        }
        console.log(`  [${entry.at}] attempt ${entry.attempt} -> ${entry.state}`);
        if (entry.error) console.log(`      error: ${entry.error}`);
        if (entry.output) console.log(`      output: ${entry.output}`);
      });
    });
}
