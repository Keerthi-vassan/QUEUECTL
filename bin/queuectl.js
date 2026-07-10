#!/usr/bin/env node
import { Command } from 'commander';
import { registerEnqueueCommand } from '../src/commands/enqueue.js';
import { registerListCommand } from '../src/commands/list.js';
import { registerStatusCommand } from '../src/commands/status.js';

const program = new Command();
program
  .name('queuectl')
  .description('CLI-based background job queue system')
  .version('1.0.0');

registerEnqueueCommand(program);
registerListCommand(program);
registerStatusCommand(program);


program.parse(process.argv);