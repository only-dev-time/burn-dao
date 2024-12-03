require('dotenv').config();
const { createPublishTx, signSendTx, signPublishTx } = require('./utils');

process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
});

let lastHour = 0;
let isProcessing = false;

const processType = process.env.PROCESS_TYPE;
const account = process.env.ACCOUNT;
const multisigAccounts = process.env.MULTISIG_ACCOUNTS.split(' ');
const metadataKey = processType === 'transfer' ? 'ttx' : 'btx'

const accountIndex = multisigAccounts.indexOf(account);
const isFirstAccount = accountIndex === 0;
const isLastAccount = accountIndex === multisigAccounts.length - 1;

const context = {
    accountName: account,
    multisigAccounts,
    accountIndex,
    metadataKey
};

// check if processing should start based on the process type
const shouldProcessStart = (currentTime) => {
    // start processing only once per hour
    if (currentTime.hour == lastHour) 
        return false;
    switch (processType) {
        case 'transfer':
            // start processing 1 minute after the previous account
            return currentTime.minutes > accountIndex + 1;
        case 'burn':
            // start processing at MARKET_MINUTE and after the previous account
            const marketMinute = parseInt(process.env.MARKET_MINUTE);
            const startSeconds = accountIndex * 15; // max 4 accounts in chain
            const endSeconds = startSeconds + 12;
            return currentTime.minutes == marketMinute && 
                currentTime.seconds >= startSeconds && currentTime.seconds <= endSeconds;
    }
};

// main function to process transactions for multisig accounts defined in .env
const processTransactions = async () => {
    const now = new Date();
    const currentTime = {
        hour: now.getUTCHours(),
        minutes: now.getUTCMinutes(),
        seconds: now.getSeconds(),
    }
    
    console.log('Checking time:', currentTime.hour, currentTime.minutes, currentTime.seconds);
    
    if (!isProcessing && shouldProcessStart(currentTime)) {
        isProcessing = true;
        console.log('Starting transaction process at hour:', currentTime.hour);

        try {
            if (isFirstAccount) {
                await createPublishTx(context);
                lastHour = currentTime.hour;
                console.log('Last signature sent at hour:', lastHour);
            } else if (isLastAccount) {
                await signSendTx(context);
                lastHour = currentTime.hour;
                console.log('Last transaction sent at hour:', lastHour);
            } else {
                await signPublishTx(context);
                lastHour = currentTime.hour;
                console.log('Last signature sent at hour:', lastHour);
            }
        } catch (err) {
            console.error('Error during transaction processing:', err.message);
        } finally {
            isProcessing = false;
        }
    }
};

// burn_chain is more time-critical
const intervalSeconds = processType == 'transfer' ? 15 : 5;
const checkInterval = setInterval(processTransactions, 1000 * intervalSeconds);
