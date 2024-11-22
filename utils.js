const steem = require('steem');
require('dotenv').config();


function getDynamicGlobalProperties() {
    return new Promise((resolve, reject) => {
        steem.api.getDynamicGlobalProperties((err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}


function sendTransaction(transaction, privateKey) {
    return new Promise((resolve, reject) => {
        steem.broadcast.send(transaction, privateKey, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function broadcastTransaction(signedTransaction) {
    return new Promise((resolve, reject) => {
        steem.api.broadcastTransaction(signedTransaction, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getAccount(account) {
    return new Promise((resolve, reject) => {
        steem.api.getAccounts([account], (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function transactionIsValid(transaction) {
    return transaction[0][0] === 'transfer' &&
    transaction[0][1].to === process.env.SEND_TO &&
    transaction[0][1].amount === `${process.env.AMOUNT_SBD} SBD`;
}

function transactionIsExpired(transaction) {
    return new Date(transaction.expiration) < new Date();
}

function getPreviousAccountName(context) {
    return context.accountIndex > 0 ? context.multisigAccounts[context.accountIndex - 1] : null;
}

async function getJsonMetadata(accountName) {
    const [account] = await getAccount(accountName)

    let json_metadata = {};
    try {
        json_metadata = JSON.parse(account.posting_json_metadata)
    } catch (error) {
        console.log(error)
    }
    return json_metadata;
}

async function getPreviousTransaction(context) {
    const { accountIndex } = context;
    let previousAccountName = getPreviousAccountName(context);
    let previous_json_metadata = await getJsonMetadata(previousAccountName);

    if (!previous_json_metadata.mtx) {
        // console.log(`No transaction data found in '${previousAccountName}'`);
        throw new Error(`No transaction data found in '${previousAccountName}'`);
    }

    let previousTx = JSON.parse(previous_json_metadata.mtx)

    if (accountIndex > 1 && transactionIsExpired(previousTx)) {
        console.log(`Transaction from '${previousAccountName}' expired, get transaction from second last account`);

        previousAccountName = getPreviousAccountName({ ...context, accountIndex: accountIndex - 1 });
        previous_json_metadata = await getJsonMetadata(previousAccountName);
        previousTx = JSON.parse(previous_json_metadata.mtx)
    }

    if (!transactionIsValid(previousTx.operations)) {
        // console.log(`Transaction data from '${previousAccountName}' mismatch`);
        throw new Error(`Transaction data from '${previousAccountName}' mismatch`);
    }
    
    if (transactionIsExpired(previousTx)) {
        // console.log(`Transaction from '${previousAccountName}' expired, no more transactions to get`);
        throw new Error('Transactions expired');
    }

    return previousTx;
}

function createPublishTx() {
    return new Promise(async (resolve, reject) => {

        const username = process.env.ACCOUNT
        const expireTime = 1000 * 3000;
        const globalProps = await getDynamicGlobalProperties();
        const ref_block_num = globalProps.head_block_number & 0xFFFF;
        const ref_block_prefix = Buffer.from(globalProps.head_block_id, 'hex').readUInt32LE(4);

        const transactionData = {
            operations: [
                ['transfer',
                    {
                        'amount': process.env.AMOUNT_SBD + ' SBD',
                        'from': process.env.MULTISIG_ACCOUNT,
                        'memo': '',
                        'to': process.env.SEND_TO
                    }
                ]
            ]
        };

        let transaction = {
            ref_block_num,
            ref_block_prefix,
            expiration: new Date(Date.now() + expireTime).toISOString().slice(0, -5),
            operations: transactionData.operations,
            extensions: []
        };

        const signedTransaction = steem.auth.signTransaction(transaction, [process.env.ACTIVE_KEY]);

        let json_metadata = await getJsonMetadata(username);
        json_metadata.mtx = JSON.stringify(signedTransaction)

        let ops = [];
        ops.push(
            [
                'account_update2',
                {
                    account: username,
                    json_metadata: "",
                    posting_json_metadata: JSON.stringify(json_metadata)
                },
            ])
        let finalTx = { operations: ops, extensions: [] };
        const tx = await sendTransaction(finalTx, { posting: process.env.POSTING_KEY })
        resolve(tx)
    })
}

async function getCreatePublishTx(context) {
    return new Promise(async (resolve, reject) => {

        try {
            const { accountName } = context;
            let json_metadata = await getJsonMetadata(accountName);
            const previousTx = await getPreviousTransaction(context);
            const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);
            json_metadata.mtx = JSON.stringify(signedTransaction)
            let ops = [];
            ops.push(
                [
                    'account_update2',
                    {
                        account: accountName,
                        json_metadata: "",
                        posting_json_metadata: JSON.stringify(json_metadata)
                    },
                ])
            let finalTx = { operations: ops, extensions: [] };
            const tx = await sendTransaction(finalTx, { posting: process.env.POSTING_KEY })
            resolve(tx)
        } catch (error) {
            reject(error)
        }
    })
}

async function sendTx(context) {
    return new Promise(async (resolve, reject) => {

        try {
            const previousTx = await getPreviousTransaction(context);
            const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);
            const tx = await broadcastTransaction(signedTransaction)
            resolve(tx)
        } catch (error) {
            reject(error)
        }
    })
}

module.exports = { createPublishTx, getCreatePublishTx, sendTx }