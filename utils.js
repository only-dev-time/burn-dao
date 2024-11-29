const { parse } = require('dotenv');
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

function getOrderBook() {
    return new Promise((resolve, reject) => {
        steem.api.getOrderBook(20, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function transactionIsValid(operations) {
    // max 2 operations allowed
    // transfer: transfer to market account and transfer back to dao account
    // burn: transfer to null account and sell SBD
    if (operations.length > 2) {
        return false;
    }
    switch (process.env.PROCESS_TYPE) {
        case 'transfer':
            // allowed are only transfer operations
            // and to accounts specified in allowedAccounts
            //const allowedAccounts = [process.env.SEND_TO, "steem.dao"];
            const allowedAccounts = [process.env.SEND_TO, "moecki.tests"]; // TODO for testing
            return operations.every(operation => 
                operation[0] === 'transfer' &&
                allowedAccounts.includes(operation[1].to)
            );
        case 'burn':
            // allowed are only transfer to null and limit_order_create operations
            return operations.every(operation => 
                operation[0] === 'limit_order_create' ||
                // (operation[0] === 'transfer' && operation[1].to === "null")
                (operation[0] === 'transfer' && operation[1].to === "moecki.tests") // TODO for testing
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

    if (!transactionIsValid(previousTx.operations)) {
        // console.log(`Transaction data from '${previousAccountName}' mismatch`);
        throw new Error(`Transaction from '${previousAccountName}' invalid\noperations: '${JSON.stringify(previousTx.operations)}'`);
    }
    
    if (transactionIsExpired(previousTx)) {
        // console.log(`Transaction from '${previousAccountName}' expired, no more transactions to get`);
        throw new Error(`Transactions from '${previousAccountName}' expired\nexpiration: '${previousTx.expiration}'`);
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
    let ops = [];
    const sbdBalance = await getBalance(process.env.MULTISIG_ACCOUNT, 'SBD');
    switch (process.env.PROCESS_TYPE) {
        case 'transfer':
            if (sbdBalance > 0) {
                // transfer AMOUNT_SBD to market account
                const sbdToMarket = Math.min(sbdBalance, parseFloat(process.env.AMOUNT_SBD));
                ops.push(getTransferOperation(
                    sbdToMarket, 
                    'SBD', 
                    process.env.MULTISIG_ACCOUNT, 
                    process.env.SEND_TO,
                    'DAO amount for selling and burning')
                )
                // transfer remaining amounts back to dao
                const sbdToDao = sbdBalance - sbdToMarket;
                // ops.push(getTransferOperation(
                //     sbdToDao, 
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
                    'DAO amount not used for selling and burning') // TODO for testing
                )
            }
        case 'burn':
            // transfer all STEEM to null
            const steemBalance = await getBalance(process.env.MULTISIG_ACCOUNT, 'STEEM');
            if (steemBalance > 0) {
                // ops.push(getTransferOperation(
                    //     steemBalance,
                    //     'STEEM',
                    //     process.env.MULTISIG_ACCOUNT,
                    //     'null',
                    //     'Burning STEEM from sold DAO funds')
                    // )
                ops.push(getTransferOperation(
                    steemBalance,
                    'STEEM',
                    process.env.MULTISIG_ACCOUNT,
                    'moecki.tests',
                    'Burning STEEM from sold SBD') // TODO for testing
                )
            }
            if (sbdBalance > 0) {
                // sell all SBD on internal market
                const steemToBuy = await getSteemToBuy(0.001);
                // ops.push(getOrderOperation(
                //     process.env.MULTISIG_ACCOUNT,
                //     sbdBalance,
                //     steemToBuy)
                // )
                ops.push(getOrderOperation(
                    process.env.MULTISIG_ACCOUNT,
                    0.001,
                    steemToBuy) // TODO for testing
                )
            }
    }
    if (ops.length === 0) {
        throw new Error('No operations generated (sbd and steem balance is 0)');
    }
    return ops;
}

function getAccountUpdateOperation(accountName, posting_json_metadata) {
    return [
        'account_update2',
        {
            'account': accountName,
            'json_metadata': '',
            'posting_json_metadata': posting_json_metadata
        }
    ];
}

function getTransferOperation(amount, unit, from, to, memo = '') {
    return [
        'transfer',
        {
            'amount': amount + ' ' + unit.toUpperCase(),
            'from': from,
            'memo': memo,
            'to': to
        }
    ];
}

function getOrderOperation(account, sbdToSell, steemToBuy) {
    const orderId = Math.floor(Date.now() / 1000);
    const expireTime = 1000 * 120; // TODO without test 1000*3000
    return [
        'limit_order_create',
        {
            'owner': account,
            'orderid': orderId,
            'amount_to_sell': sbdToSell + ' SBD',
            'min_to_receive': steemToBuy + ' STEEM',
            'fill_or_kill': false,
            'expiration': new Date(Date.now() + expireTime).toISOString().slice(0, -5)
        }
    ];
}

async function getSteemToBuy(sbdToSell) {
    const orderBook = await getOrderBook();
    
    let sbd = 0;
    let i = 0;
    let real_price = '';
    
    // SBD and STEEM amounts are stored as integers
    const precision = 3;
    sbdToSell *= 10 ** precision;
    
    // get STEEM amount to sell all SBD
    // loop over all asks until enough SBD are available
    // last real_price is the price to sell all SBD
    while (sbd < sbdToSell) {
        sbd += orderBook.asks[i].sbd;
        real_price = orderBook.asks[i].real_price;
        i++;
    }
    // console.log('real_price:', real_price);
    let price = parseFloat(real_price);
    // add a markup to sale in any case (0.5%)
    price *= 1.005;
    // console.log('price:', price);

    return parseInt(sbdToSell / price) / 10 ** precision;
}

function createPublishTx(context) {
    return new Promise(async (resolve, reject) => {
        
        try {
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
        } catch (error) {
            reject(error)
        }
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