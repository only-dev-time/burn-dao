require('dotenv').config();
const { createPublishTx, getCreatePublishTx, sendTx } = require('./utils');

process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
});

let lastHour = 0;
let isProcessing = false;

const account = process.env.ACCOUNT;
const multisigAccounts = process.env.MULTISIG_ACCOUNTS.split(' ');

const accountIndex = multisigAccounts.indexOf(account);
const isFirstAccount = accountIndex === 0;
const isLastAccount = accountIndex === multisigAccounts.length - 1;

const context = {
    username: account,
    multisigAccounts,
    accountIndex
};

const processTransactions = async () => {
    const currentHour = new Date().getUTCHours();
    const currentMinutes = new Date().getMinutes();
    
    console.log('Checking time:', currentHour, currentMinutes);
    
    if (currentHour !== lastHour && currentMinutes > accountIndex + 1) {
        isProcessing = true;
        console.log('Starting transaction process at hour:', currentHour);

        try {
            if (isFirstAccount) {
                const tx = await createPublishTx();
                lastHour = currentHour;
                console.log('Last signature sent at hour:', lastHour);
            } else if (isLastAccount) {
                await sendTx(context);
                lastHour = currentHour;
                console.log('Last transaction sent at hour:', lastHour);
            } else {
                await getCreatePublishTx(context);
                lastHour = currentHour;
                console.log('Last signature sent at hour:', lastHour);
            }
        } catch (err) {
            console.error('Error during transaction processing:', err);
        } finally {
            isProcessing = false;
        }
    }
};

const checkInterval = setInterval(processTransactions, 1000 * 5);
