import { acquireLock, releaseLock } from "./lock.js";
import { readFile, writeFile } from "fs/promises";

const CONFIG_PATH = "./data/config.json";
const CONFIG_LOCK_PATH = "./data/config.json.lock";

const POSSIBLE_CONFIG_KEYS = [ 'max_retries' , 'backoff_base' ];

const DEFAULT_CONFIG = {
  max_retries: 3,
  backoff_base: 2,
};

async function readConfigFile() {
  try {
    const fd = await readFile(CONFIG_PATH, "utf8");
    let config = JSON.parse(fd);
    return config;
  } catch (err) {
    if(err.code === 'ENOENT') return DEFAULT_CONFIG;
    else throw err;
  }
}

async function writeConfigFile(config) {
    try{
        let new_config = JSON.stringify(config,null,2);
        await writeFile(CONFIG_PATH , new_config);
    }catch(err){
        throw err;
    }
}

export async function getConfig() {
  // TODO: lock, read, release, return. Same shape as getJob but no id needed.
  await acquireLock(CONFIG_LOCK_PATH);
  try{
    let config = await readConfigFile();
    return config;
  }finally{
    await releaseLock(CONFIG_LOCK_PATH);
  }
}

export async function setConfigValue(key, value) {
  // TODO: lock, read existing config, merge in the new key/value, write, release, return updated config.
  // Think about: should this validate that `key` is one of the known config keys
  // (max_retries, backoff_base)? What happens if someone runs `config set typo_key 5`?
  if(!POSSIBLE_CONFIG_KEYS.includes(key)) throw new Error(`the give config key ${key} is invalid`);
  if(typeof(value) !== 'number' || value < 0) throw new Error(`the given value ${value} for the key ${key} is invalid , (should be an positive integer)`);
  await acquireLock(CONFIG_LOCK_PATH);
  let config;
  try{
    config = await readConfigFile();
    config[key] = value;
    await writeConfigFile(config);
  }finally{
    await releaseLock(CONFIG_LOCK_PATH);
  }
    return config;
}
