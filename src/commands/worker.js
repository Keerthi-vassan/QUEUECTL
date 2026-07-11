import { startWorkers, stopWorkers } from "../core/workerManager.js";

export function registerWorkerCommand(program) {
  const workerCommand = program.command('worker').description('commands related to worker management');

  workerCommand
    .command('start')
    .description('starts 1 worker by default, can start many with --count')
    .option('-c, --count <num>', 'number of workers to start', '1')
    .action(async (options) => {
      const count = Number(options.count);

      if (Number.isNaN(count) || count <= 0) {
        console.error(`Invalid count "${options.count}" — must be a positive integer`);
        process.exit(1);
      }

      try {
        const workers = await startWorkers(count);
        console.log(`Started ${options.count} new worker(s). PIDs:`);
        workers.forEach(pid => console.log(`  ${pid}`));
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  workerCommand
    .command('stop')
    .description('stops all currently running workers')
    .action(async () => {
      try {
        const stoppedCount = await stopWorkers();
        console.log(`Stopped ${stoppedCount} worker(s).`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}