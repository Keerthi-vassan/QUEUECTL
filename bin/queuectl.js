#!/usr/bin/env node
import { Command } from 'commander';
import { registerEnqueueCommand } from '../src/commands/enqueue.js';
import { registerListCommand } from '../src/commands/list.js';
import { registerStatusCommand } from '../src/commands/status.js';
import { registerDlqCommand } from '../src/commands/dlq.js';
import { registerConfigCommand } from '../src/commands/config.js';

const program = new Command();
program
  .name('queuectl')
  .description('CLI-based background job queue system')
  .version('1.0.0');

registerEnqueueCommand(program);
registerListCommand(program);
registerStatusCommand(program);
registerDlqCommand(program);
registerConfigCommand(program);

program.parse(process.argv);