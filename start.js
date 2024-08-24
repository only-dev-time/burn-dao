require('dotenv').config()
const { createPublishTx, getCreatePublishTx, sendTx } = require('./utils');

process.on('uncaughtException', err => {
    console.error('Uncaught exception', err);
});

let lastHour = 0;
let isProcessing = false;
const account = process.env.ACCOUNT
const multisigAccounts = process.env.MULTISIG_ACCOUNTS.split(' ')
const isFirstAccount = multisigAccounts.indexOf(account) === 0
const isLastAccount = multisigAccounts.indexOf(account) === multisigAccounts.length - 1

const check = setInterval(() => {
    if (!isProcessing) {
        const currentHour = new Date().getUTCHours();
        const currentMinutes = new Date().getMinutes();
        console.log('...', currentHour, currentMinutes);
        if (currentHour !== lastHour && currentMinutes > multisigAccounts.indexOf(account) + 1) {
            isProcessing = true;
            console.log('1/2 Start process', currentHour);
            if (isFirstAccount) {
                createPublishTx().then((tx) => {
                    lastHour = currentHour;
                    lastTx = tx;
                    isProcessing = false;
                    console.log('2/2 Last signature sent at', lastHour);
                })
            }
            else if (isLastAccount) {
                sendTx(multisigAccounts[multisigAccounts.indexOf(account) - 1]).then(() => {
                    lastHour = currentHour;
                    isProcessing = false;
                    console.log('2/2 Last tx sent at', lastHour);
                })
            }
            else
                getCreatePublishTx(multisigAccounts[multisigAccounts.indexOf(account) - 1]).then(() => {
                    lastHour = currentHour;
                    isProcessing = false;
                    console.log('2/2 Last signature sent at', lastHour);
                }).catch(err => {
                    console.error('Set last Signing failed, action required', err);
                });
        }
    }
}, 1000 * 5);