import { fork } from 'child_process';
import { registerWorkers, unregisterWorkers, stopWorkers, WORKER_SCRIPT, GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "../core/workerManager.js";

export function registerWorkerCommand(program) {
  const workerCommand = program.command('worker').description('commands related to worker management');

  workerCommand
    .command('start')
    .description('starts 1 worker by default, can start many with --count. Runs in the foreground until stopped (Ctrl+C or `worker stop` from another terminal).')
    .option('-c, --count <num>', 'number of workers to start', '1')
    .action(async (options) => {
      const count = Number(options.count);

      if (Number.isNaN(count) || count <= 0) {
        console.error(`Invalid count "${options.count}" — must be a positive integer`);
        process.exit(1);
      }

      const children = [];
      for (let i = 0; i < count; i++) {
        // No explicit worker-id argv: worker.js defaults to `worker-${process.pid}`
        // using the *child's own* pid, which keeps the printed label matching the
        // actual OS process you'd target with `kill`.
        const child = fork(WORKER_SCRIPT, [], { stdio: 'inherit' });
        children.push(child);
      }
      const pids = children.map((c) => c.pid);

      try {
        await registerWorkers(pids);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      console.log(`Started ${count} worker(s). PIDs: ${pids.join(', ')}`);
      console.log(`Press Ctrl+C to stop gracefully, or run "queuectl worker stop" from another terminal.`);

      let shuttingDown = false;
      const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`\nReceived ${signal}, signaling worker(s) to finish their current job and stop...`);
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch (err) {
            // already exited — nothing to do
          }
        }

        // Only armed once a shutdown was actually requested - the timer starts
        // from here, not from process launch, so a worker running normally is
        // never at risk of this firing on its own.
        setTimeout(() => {
          console.log(`Worker(s) did not exit within ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms, force-killing...`);
          for (const child of children) {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
            }
          }
        }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      // Blocks the process (keeps it in the foreground) indefinitely until every
      // worker exits - whether that's from the signal forwarding above (which
      // also arms the force-kill escalation timer in shutdown()) or from a
      // `worker stop` run in a different terminal signaling these same PIDs
      // directly (that path has its own independent escalation in stopWorkers).
      await Promise.all(children.map((child) => new Promise((resolve) => child.on('exit', resolve))));

      await unregisterWorkers(pids);
      console.log('All workers stopped.');
      process.exit(0);
    });

  workerCommand
    .command('stop')
    .description('stops all currently running workers (can be run from a different terminal than the one running them)')
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
