import { getConfig, setConfigValue } from "../core/configStore.js";

const KEY_MAP = {
  'max-retries': 'max_retries',
  'backoff-base': 'backoff_base',
  'stale-job-timeout-ms': 'stale_job_timeout_ms',
};

export function registerConfigCommand(program) {
  const configCommand = program.command('config').description('manage default config like max-retries and backoff-base');

  configCommand
    .command('set <key> <value>')
    .description('set a config value (max-retries or backoff-base)')
    .action(async (key, value) => {
      try {
        const internalKey = KEY_MAP[key] ?? key; // fall back to raw key, let configStore reject unknowns
        const numericValue = Number(value);

        if (Number.isNaN(numericValue)) {
          throw new Error(`"${value}" is not a valid number`);
        }

        const updated = await setConfigValue(internalKey, numericValue);
        console.log(`Set ${key} = ${numericValue}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  configCommand
    .command('get [key]')
    .description('show current config, or a single value if a key is given')
    .action(async (key) => {
      try {
        const config = await getConfig();
        if (key) {
          const internalKey = KEY_MAP[key] ?? key;
          console.log(`${key}: ${config[internalKey]}`);
        } else {
          console.log(config);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}