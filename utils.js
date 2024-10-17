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

function createPublishTx() {
    return new Promise(async (resolve, reject) => {

        const username = process.env.ACCOUNT
        const expireTime = 1000 * 3590;
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

        const [account] = await getAccount(username)
        let json_metadata;
        try {
            json_metadata = JSON.parse(account.posting_json_metadata)
        } catch (error) {
            console.log(error)
        }
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

async function getCreatePublishTx(from) {
    return new Promise(async (resolve, reject) => {

        const username = process.env.ACCOUNT
        const [fromAccount] = await getAccount(from)
        const [account] = await getAccount(username)
        let from_json_metadata = {};
        let json_metadata = {};
        try {
            from_json_metadata = JSON.parse(fromAccount.posting_json_metadata)
            json_metadata = JSON.parse(account.posting_json_metadata)

        } catch (error) {
            console.log(error)
        }
        let previousTx = JSON.parse(from_json_metadata.mtx)

        if (!transactionIsValid(previousTx.operations)) {
            console.log('Transaction data mismatch');
            throw new Error('Transaction data mismatch');
        }
        
        const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);
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

async function sendTx(from) {
    return new Promise(async (resolve, reject) => {
        const [fromAccount] = await getAccount(from)
        let from_json_metadata = {};
        try {
            from_json_metadata = JSON.parse(fromAccount.posting_json_metadata)

        } catch (error) {
            console.log(error)
        }
        let previousTx = JSON.parse(from_json_metadata.mtx)
        
        if (!transactionIsValid(previousTx.operations)) {
            console.log('Transaction data mismatch');
            throw new Error('Transaction data mismatch');
        }

        const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);

        const tx = await broadcastTransaction(signedTransaction)
        resolve(tx)
    })
}

module.exports = { createPublishTx, getCreatePublishTx, sendTx }