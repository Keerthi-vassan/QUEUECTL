import {open , unlink} from 'fs/promises'

const LOCK_PATH = './data/jobs.json.lock'

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve , ms));
}

export async function acquireLock(max_attempts = 10){
    let attempts = 0;
    let base_sleep = 5;
    while(attempts <= max_attempts){
        try{
            const fd = await open(LOCK_PATH, 'wx');
            await fd.close();
            return;
        }catch(err){
            if(err.code === 'EEXIST'){
                let abs_Sleep = Math.min(base_sleep ** attempts, 500) + base_sleep * Math.random();
                console.log("file is aldready locked by some other worker ie.. the lock file aldready exists");
                await sleep(abs_Sleep);
                attempts++;
            }else{
                throw err;
            }
        }
    }
    throw new Error('Could not acquire lock : max retries exceeded');
}

export async function releaseLock(){
    try{
        await unlink(LOCK_PATH);
    }catch(err){
        if(err.code === 'ENOENT'){
            console.log("the lock does not exist or the lock is aldready removed");
        }else{
            throw err;
        }
    }
    return;
}