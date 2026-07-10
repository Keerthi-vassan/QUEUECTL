export function calculateBackoffMs(attempts , base =2){;
    return (base**attempts)*1000;
}

export function nextAttemptTimestamp(attempts , base=2){
    let delay = calculateBackoffMs(attempts,base);
    let next_attempt = new Date(Date.now() + delay);

    return next_attempt.toISOString();
}