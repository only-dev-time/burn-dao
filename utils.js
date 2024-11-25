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

function transactionIsValid(operations) {
    switch (process.env.PROCESS_TYPE) {
        case 'transfer':
            // max 2 operations allowed
            // transfer to market account and transfer back to dao account
            if (operations.length > 2) {
                return false;
            }
            // allowed are only transfer operations
            // and to accounts specified in allowedAccounts
            //const allowedAccounts = [process.env.SEND_TO, "steem.dao"];
            const allowedAccounts = [process.env.SEND_TO, "moecki.tests"]; // for testing
            return operations.every(operation => 
                operation[0] === 'transfer' &&
                allowedAccounts.includes(operation[1].to)
            );
    }
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

async function getBalance(accountName, unit) {
    const [account] = await getAccount(accountName)

    const key = unit === 'STEEM' ? 'balance' : 'sbd_balance';
    const balance = account[key].split(' ')[0]
    
    return parseFloat(balance);
}

async function getPreviousTransaction(context) {
    const { accountIndex, metadataKey } = context;
    let previousAccountName = getPreviousAccountName(context);
    let previous_json_metadata = await getJsonMetadata(previousAccountName);

    if (!previous_json_metadata[metadataKey]) {
        // console.log(`No transaction data found in '${previousAccountName}'`);
        throw new Error(`No transaction data found in '${previousAccountName}'`);
    }

    let previousTx = JSON.parse(previous_json_metadata[metadataKey])

    if (accountIndex > 1 && transactionIsExpired(previousTx)) {
        console.log(`Transaction from '${previousAccountName}' expired, get transaction from second last account`);

        previousAccountName = getPreviousAccountName({ ...context, accountIndex: accountIndex - 1 });
        previous_json_metadata = await getJsonMetadata(previousAccountName);
        previousTx = JSON.parse(previous_json_metadata[metadataKey])
    }

    if (!transactionIsValid(previousTx.operations, context)) {
        // console.log(`Transaction data from '${previousAccountName}' mismatch`);
        throw new Error(`Transaction data from '${previousAccountName}' mismatch`);
    }
    
    if (transactionIsExpired(previousTx)) {
        // console.log(`Transaction from '${previousAccountName}' expired, no more transactions to get`);
        throw new Error('Transactions expired');
    }

    return previousTx;
}

async function getBlankTransaction() {
    const expireTime = 1000 * 3000;
    const globalProps = await getDynamicGlobalProperties();
    const ref_block_num = globalProps.head_block_number & 0xFFFF;
    const ref_block_prefix = Buffer.from(globalProps.head_block_id, 'hex').readUInt32LE(4);

    return {
        ref_block_num,
        ref_block_prefix,
        expiration: new Date(Date.now() + expireTime).toISOString().slice(0, -5),
        operations: [],
        extensions: []
    };
}

async function getOperations() {
    switch (process.env.PROCESS_TYPE) {
        case 'transfer':
            let ops = [];
            // transfer AMOUNT_SBD to market account
            const sbd_balance = await getBalance(process.env.MULTISIG_ACCOUNT, 'SBD');
            const to_market = Math.min(sbd_balance, parseFloat(process.env.AMOUNT_SBD));
            ops.push(getTransferOperation(
                to_market, 
                'SBD', 
                process.env.MULTISIG_ACCOUNT, 
                process.env.SEND_TO,
                'DAO amount for selling and burning')
            )
            // transfer remaining amounts back to dao
            const to_dao = sbd_balance - to_market;
            // ops.push(getTransferOperation(
            //     to_dao, 
            //     'SBD', 
            //     process.env.MULTISIG_ACCOUNT, 
            //     'steem.dao',
            //     'DAO amount not used for selling and burning')
            // )
            ops.push(getTransferOperation(
                0.001, 
                'SBD', 
                process.env.MULTISIG_ACCOUNT, 
                'moecki.tests',
                'DAO amount not used for selling and burning') // for testing
            )
            return ops;
        case 'burn':
    }
}

function getAccountUpdateOperation(accountName, posting_json_metadata) {
    return ['account_update2',
        {
            'account': accountName,
            'json_metadata': '',
            'posting_json_metadata': posting_json_metadata
        }
    ];
}

function getTransferOperation(amount, unit, from, to, memo = '') {
    return ['transfer',
        {
            'amount': amount + ' ' + unit.toUpperCase(),
            'from': from,
            'memo': memo,
            'to': to
        }
    ];
}

function getOrderOperation(account, orderid, amount, unit) {
}

function createPublishTx(context) {
    return new Promise(async (resolve, reject) => {
        
        const { accountName, metadataKey } = context;

        // create transaction with necessary operations
        let transaction = await getBlankTransaction();
        transaction.operations = await getOperations();
        const signedTransaction = steem.auth.signTransaction(transaction, [process.env.ACTIVE_KEY]);

        // add signed transaction to account metadata
        let json_metadata = await getJsonMetadata(accountName);
        json_metadata[metadataKey] = JSON.stringify(signedTransaction)

        // update account metadata with signed transaction
        const ops = [
            getAccountUpdateOperation(accountName, JSON.stringify(json_metadata))
        ];
        let finalTx = { operations: ops, extensions: [] };
        const tx = await sendTransaction(finalTx, { posting: process.env.POSTING_KEY })
        
        resolve(tx)
    })
}

async function signPublishTx(context) {
    return new Promise(async (resolve, reject) => {

        try {
            const { accountName, metadataKey } = context;
            
            // get transaction from previous or second last account and sign it
            const previousTx = await getPreviousTransaction(context);
            const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);

            // add signed transaction to account metadata
            let json_metadata = await getJsonMetadata(accountName);
            json_metadata[metadataKey] = JSON.stringify(signedTransaction)
            
            // update account metadata with signed transaction
            const ops = [
                getAccountUpdateOperation(accountName, JSON.stringify(json_metadata))
            ];    
            let finalTx = { operations: ops, extensions: [] };
            const tx = await sendTransaction(finalTx, { posting: process.env.POSTING_KEY })
            
            resolve(tx)
        } catch (error) {
            reject(error)
        }
    })
}

async function signSendTx(context) {
    return new Promise(async (resolve, reject) => {

        try {
            // get transaction from previous or second last account and sign it
            const previousTx = await getPreviousTransaction(context);
            const signedTransaction = steem.auth.signTransaction(previousTx, [process.env.ACTIVE_KEY]);
            
            // broadcast signed transaction
            const tx = await broadcastTransaction(signedTransaction)
            
            resolve(tx)
        } catch (error) {
            reject(error)
        }
    })
}

module.exports = { createPublishTx, signPublishTx, signSendTx }