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

const shouldProcessStart = (currentHour, currentMinutes, currentSeconds) => {
    // start processing only once per hour
    if (currentHour == lastHour) 
        return false;
    switch (processType) {
        case 'transfer':
            // start processing 1 minute after the previous account
            return currentMinutes > accountIndex + 1;
        case 'burn':
            // start processing at MARKET_MINUTE and after the previous account
            const marketMinute = parseInt(process.env.MARKET_MINUTE);
            const startSeconds = accountIndex * 15; // max 4 accounts in chain
            const endSeconds = startSeconds + 11;
            return currentMinutes == marketMinute && 
                currentSeconds >= startSeconds && currentSeconds <= endSeconds;
    }
};

const processTransactions = async () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinutes = now.getUTCMinutes();
    const currentSeconds = now.getSeconds();
    
    console.log('Checking time:', currentHour, currentMinutes, currentSeconds);
    
    if (shouldProcessStart(currentHour, currentMinutes, currentSeconds)) {
        isProcessing = true;
        console.log('Starting transaction process at hour:', currentHour);

        try {
            if (isFirstAccount) {
                await createPublishTx(context);
                lastHour = currentHour;
                console.log('Last signature sent at hour:', lastHour);
            } else if (isLastAccount) {
                await signSendTx(context);
                lastHour = currentHour;
                console.log('Last transaction sent at hour:', lastHour);
            } else {
                await signPublishTx(context);
                lastHour = currentHour;
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
