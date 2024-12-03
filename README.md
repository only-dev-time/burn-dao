# SteemWitnesses MultiSig

This tool makes a chaining of signature to use the multisig feature on Steem.
Available are two chaining processes:

1. To transfer SBD from a multisign account (**transfer** process).
2. To sell SBD on the internal market and burn the bought STEEM (**burn** process).

## How to use this code?

### Using with Docker

It is recommended to run the script in a Docker container.

- Clone the Repo
  
- Create a .env file for each process with the required private keys. Explanation for the .env file below.

  1. For **transfer** process create a file named `.env-transfer`
  2. For **burn** process create a file named `.env-burn`
  
- Building the images
  
  `docker compose build`

- Running the containers

  `docker compose up -d`

### Using without Docker

Without Docker only one process can started, because the process expects a file named `.env`.

- Install dependencies

  `npm install`

- Create a .env file with the required private keys. Explanation for the .env file below.

- Run `npm run start`

## Env file

### transfer process

- PROCESS_TYPE=transfer                 #chain type
- MULTISIG_ACCOUNT=moecki.transfer      #the multisig account
- ACCOUNT=moecki.signer1                #current account (if in last position will trigger the transfer using the previous account tx stored in the json_metadata field)
- POSTING_KEY=XXXX                      #current account posting key (used to update the json_metadata field)
- ACTIVE_KEY=XXXX                       #current account active key (used to sign the transaction)
- MULTISIG_ACCOUNTS=moecki.multisig moecki.signer1 moecki.signer2 moecki.signer3                          #list of accounts used for chaining
- AMOUNT_SBD=0.001                      #amount of SBD to send (remaining SBD will be transferred back to DAO)
- SEND_TO=moecki.burn                   #to whom the funds should be send

### burn process

- PROCESS_TYPE=burn                     #chain type
- MULTISIG_ACCOUNT=moecki.burn          #the multisig account
- ACCOUNT=moecki.signer1                #current account (if in last position will trigger the transfer using the previous account tx stored in the json_metadata field)
- POSTING_KEY=XXXX                      #current account posting key (used to update the json_metadata field)
- ACTIVE_KEY=XXXX                       #current account active key (used to sign the transaction)
- MULTISIG_ACCOUNTS=moecki.burn moecki.signer1 moecki.signer2 moecki.signer3                                 #list of accounts used for chaining
- MARKET_MINUTE=11                      #minute of each hour in which SBD are sold (> 6)
