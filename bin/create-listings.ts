import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import ExifTransformer from 'exif-be-gone'
import * as LitJsSdk from '@lit-protocol/lit-node-client-nodejs'
import { LitNetwork } from '@lit-protocol/constants'
import semaphoreABI from '../src/semaphoreVerifierABI'
import { ethers } from 'ethers'
import {
  LitAccessControlConditionResource,
  LitAbility,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from '@lit-protocol/auth-helpers'
import { create as createW3S } from '@web3-storage/w3up-client'
import { filesFromPaths } from 'files-from-path'
import JSON5 from 'json5'
import { debug, w3s } from './config'
import { getMnemonic } from './lib'

const verifierContractAddress = '0xb908Bcb798e5353fB90155C692BddE3b4937217C'
const chain = 'sepolia'
const litNetwork = LitNetwork.DatilDev
const capacityTokenId = null

const bandadaMembershipCondition = {
  contractAddress: verifierContractAddress,
  functionName: 'verifyProof',
  functionParams: [
    ':litParam:merkleTreeRoot',
    ':litParam:nullifierHash',
    ':litParam:signal',
    ':litParam:externalNullifier',
    ':litParam:proof',
    ':litParam:merkleTreeDepth',
  ],
  functionAbi: semaphoreABI,
  chain,
  returnValueTest: {
    key: '',
    comparator: '=',
    value: '',
  },
}

const getSessionSignatures = async ({ litNodeClient }) => {
  const mnemonic = getMnemonic()
  const wallet = ethers.Wallet.fromMnemonic(mnemonic)
  const latestBlockhash = await litNodeClient.getLatestBlockhash()

  const authNeededCallback = async ({
    uri, expiration, resourceAbilityRequests,
  }) => {
    if(!uri) throw new Error('`uri` is required.')
    if(!expiration) throw new Error('`expiration` is required.')
    if(!resourceAbilityRequests) {
      throw new Error('`resourceAbilityRequests` is required.')
    }

    const toSign = await createSiweMessageWithRecaps({
      uri,
      expiration,
      resources: resourceAbilityRequests,
      walletAddress: wallet.address,
      nonce: latestBlockhash,
      litNodeClient,
    })

    return await generateAuthSig({
      signer: wallet,
      toSign,
    })
  }

  const litResource = new LitAccessControlConditionResource('*')
  let capacityDelegationAuthSig

  if(litNetwork !== LitNetwork.DatilDev) {
    if(!capacityTokenId) {
      throw new Error('`capacityTokenId` is required.')
    }

    ({ capacityDelegationAuthSig } = (
      await litNodeClient.createCapacityDelegationAuthSig({
        uses: '1',
        signer: wallet,
        capacityTokenId,
        delegateeAddresses: [wallet.address],
      })
    ))
  }

  return await litNodeClient.getSessionSigs({
    chain,
    resourceAbilityRequests: [{
      resource: litResource,
      ability: LitAbility.AccessControlConditionDecryption,
    }],
    authNeededCallback,
    capacityDelegationAuthSig,
  })
}

const stripExifAndEncrypt = async (
  { directory }: { directory: string }
) => {
  console.info(`Processing Directory: "${directory}".`)
  const files = fs.readdirSync(directory)

  const outdir = path.join(directory, 'scrubbed-images')
  await fs.promises.mkdir(outdir, { recursive: true })

  const output = {}

  for (const file of files) {
    try {
      const ext = path.extname(file)

      if(!/\.(jpe?g|png|tiff?|gif|wepb)/i.test(ext)) {
        console.info(`Skipping non-image: "${file}".`)
      } else {
        const inPath = path.join(directory, file)
        const hash = crypto.createHash('sha256')
        const input = fs.createReadStream(inPath)
        let sha256

        input.on('readable', () => {
          const data = input.read()
          if(data) {
            hash.update(data)
          } else {
            sha256 = `0x${hash.digest('hex')}`
          }
        })

        await new Promise((resolve, reject) => {
          input.on('end', resolve)
          input.on('error', reject)
        })

        if(debug > 0) {
          console.debug(`Hashed: "${file}" → ${sha256}.`)
        }

        const outPath = (
          path.join(outdir, `${sha256}.scrubbed${ext}`)
        )
        const fullPath = {
          in: inPath,
          out: outPath,
          enc: `${outPath}.enc`,
          hash: `${outPath}.hash`,
        }

        if(
          fs.existsSync(fullPath.enc)
          && fs.existsSync(fullPath.hash)
        ) {
          console.info(`Skipping Existing Encryption: "${file}".`)
        } else {
          if(
            litNetwork !== LitNetwork.DatilDev
            && !capacityTokenId
          ) {
            throw new Error('`capacityTokenId` is required.')
          }

          const reader = fs.createReadStream(fullPath.in)
          const writer = fs.createWriteStream(fullPath.out)
          reader.pipe(new ExifTransformer()).pipe(writer)

          const litNodeClient = new LitJsSdk.LitNodeClientNodeJs({
            litNetwork,
            alertWhenUnauthorized: false,
            debug: debug > 1,
          })
          await litNodeClient.connect()

          if(debug > 0) {
            console.debug(`Encrypting: "${fullPath.out}".`)
          }

          const { ciphertext, dataToEncryptHash } = (
            await LitJsSdk.encryptFile(
              {
                file: await fs.openAsBlob(fullPath.out),
                chain,
                evmContractConditions: [
                  bandadaMembershipCondition
                ],
                sessionSigs: await getSessionSignatures({
                  litNodeClient,
                }),
              },
              litNodeClient,
            )
          )

          const outBuffer = Buffer.from(ciphertext, 'base64')
          fs.writeFileSync(fullPath.enc, outBuffer)
          fs.writeFileSync(fullPath.hash, dataToEncryptHash)

          if(debug > 0) {
            console.debug(
              `Wrote "${fullPath.out}.(enc|hash)".`
            )
          }
        }

        if(w3s.owner && w3s.spaceDID) {
          const w3sClient = await createW3S()
          await w3sClient.login(w3s.owner)
          await w3sClient.setCurrentSpace(w3s.spaceDID)

          const cid = await w3sClient.uploadDirectory(
            await filesFromPaths([
              fullPath.enc, fullPath.hash,
            ])
          )

          if(debug > 0) {
            console.debug(
              `File "${fullPath.out}.(enc|hash)"`
              + `\n  uploaded to Web3.Storage with CID: ${cid}.`
            )
          }

          output[file] = {
            cid: cid.toString(), sha256,
          }
        }
      }
    } catch(error) {
      console.error(`Error Processing: ${file}`)
      console.error({ error })
      throw new Error('Quitting due to error.')
    }
  }
 
  const outputFile = path.join(outdir, 'cids.json5')
  fs.writeFileSync(outputFile, JSON5.stringify(output, null, 2))

  console.info(`Wrote CIDs to: "${outputFile}".`)
}

if(process.argv.length < 3) {
  throw new Error(
    `Error: ${process.argv.length}`
    + ` argument${process.argv.length === 1 ? '' : 's'}`
    + '\n\nUsage: npx tsx create-listings.ts <image directory>'
  )
}

const directory = process.argv.at(-1)

if(!directory) throw new Error('`directory` is required.')

try {
  await stripExifAndEncrypt({ directory })
  process.exit(0)
} catch(error) {
  console.error({ 'Fatal Error': error })
  process.exit(5)
}