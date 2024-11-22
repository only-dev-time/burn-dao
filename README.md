# SteemWitnesses MultiSig

This tool makes a chaining of signature to use the multisig feature on Steem to transfer SBD from a multisign account. Another branch is available but it needs a fix to retrieve the same refs for blocks.

## How to use this code?

### Using without Docker

- Install dependencies

  `npm install`

- Create a .env file with the required private keys. Explanation for the .env file below.

- Run `npm run start`

### Using with Docker

- Create a .env file with the required private keys. Explanation for the .env file below.
  
- Building an image
  
  `docker build -t ms_transfer_image .`

- Running the container

  `docker run -d --name ms_transfer ms_transfer_image`
  
## Env file

- MULTISIG_ACCOUNT=funditionms #the multisig account
- ACCOUNT=funditionms1 #current account (if in last position will trigger the transfer using the previous account tx stored in the json_metadata field)
- POSTING_KEY=XXXX  #current account posting key (used to update the json_metadata field)
- ACTIVE_KEY=XXXX  #current account active key (used to sign the transaction)
- MULTISIG_ACCOUNTS=funditionms funditionms1 funditionms2 funditionms3  #list of accounts used for chaining
- AMOUNT_SBD=0.001 #amount of SBD to send
- SEND_TO=future.witness #to whom the funds should be send
