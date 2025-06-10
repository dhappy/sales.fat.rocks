import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import ExifTransformer from 'exif-be-gone'
import { encryptFile } from '@lit-protocol/encryption'
import * as LitJSSdk from '@lit-protocol/lit-node-client-nodejs'
import { LIT_ABILITY, LIT_NETWORK } from '@lit-protocol/constants'
import semaphoreABI from '../src/semaphoreVerifierABI.ts'
import { ethers } from 'ethers'
import {
  LitAccessControlConditionResource,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from '@lit-protocol/auth-helpers'
import { create as createW3S } from '@web3-storage/w3up-client'
import { filesFromPaths } from 'files-from-path'
import JSON5 from 'json5'
import { debug, w3s } from './config.ts'
import { getMnemonic } from './lib.ts'

const verifierContractAddress = '0xb908Bcb798e5353fB90155C692BddE3b4937217C'
const chain = 'sepolia'
const litNetwork = LIT_NETWORK.DatilDev
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
  chain: chain as 'sepolia',
  returnValueTest: {
    key: '',
    comparator: '=',
    value: '',
  },
}

const mnemonic = getMnemonic()
const wallet = ethers.Wallet.fromPhrase(mnemonic)

const getSessionSignatures = async ({ litNodeClient }) => {
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

  if(litNetwork !== LIT_NETWORK.DatilDev) {
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
      ability: LIT_ABILITY.AccessControlConditionDecryption,
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

  const output: Record<string, {
    cid: string
    cyphertext: string
    url: string
  }> = {}

  for(const file of files) {
    try {
      const ext = path.extname(file)
      if(!('escape' in RegExp)) {
        throw new Error('No `RegExp.escape()`.')
      }
      const name = file.replace(new RegExp(
        `${(RegExp as { escape: (str: string) => string }).escape(ext)}$`
      ), '')

      if(!/\.(jpe?g|png|tiff?|gif|wepb)/i.test(ext)) {
        console.info(`Skipping non-image: "${file}".`)
      } else {
        const inPath = path.join(directory, file)
        const hash = crypto.createHash('sha256')
        const input = fs.createReadStream(inPath)
        let sha256: string | null = null

        input.on('readable', () => {
          const data = input.read()
          if(data) {
            hash.update(data)
          } else {
            sha256 = `0x${hash.digest('hex')}`
          }
        })

        await new Promise((resolve, reject) => {
          input.on('end', () => resolve(sha256))
          input.on('error', reject)
        })

        if(debug > 0) {
          console.debug(`Hashed: "${file}" → ${sha256}.`)
        }

        const outPath = (
          path.join(outdir, `${name}.scrubbed${ext}`)
        )
        const basePath: { cypher?: string } = {}
        const fullPath: {
          in: string,
          out: string,
          enc: string,
          cypher?: string,
        } = {
          in: inPath,
          out: outPath,
          enc: path.join(outdir, `${sha256}${ext}`),
        }

        if(fs.existsSync(fullPath.enc)) {
          console.info(`Skipping Existing Encryption: "${file}".`)
        } else {
          if(
            litNetwork !== LIT_NETWORK.DatilDev && !capacityTokenId
          ) {
            throw new Error('`capacityTokenId` is required.')
          }

          const reader = fs.createReadStream(fullPath.in)
          const writer = fs.createWriteStream(fullPath.out)
          reader.pipe(new ExifTransformer()).pipe(writer)

          const litClient = new LitJSSdk.LitNodeClientNodeJs({
            litNetwork,
            alertWhenUnauthorized: false,
            debug: debug > 1,
          })
          await litClient.connect()

          if(debug > 0) {
            console.debug(`Encrypting: "${fullPath.out}".`)
          }

          const data = await Deno.readFile(fullPath.out);
          const { ciphertext, dataToEncryptHash } = (
            await encryptFile(
              {
                file: new Blob([data]),
                chain,
                evmContractConditions: [
                  bandadaMembershipCondition
                ],
                sessionSigs: await getSessionSignatures({
                  litNodeClient: litClient,
                }),
              },
              litClient,
            )
          )

          const outBuffer = Buffer.from(ciphertext, 'base64')
          basePath.cypher = `${dataToEncryptHash.replace(/^(0x)?/, '0x')}${ext}.encrypted`
          fullPath.cypher = path.join(outdir, basePath.cypher)
          fs.writeFileSync(fullPath.cypher, outBuffer)
        }

        if(w3s.owner && w3s.spaceDID) {
          const w3sClient = await createW3S()
          await w3sClient.login(w3s.owner)
          await w3sClient.setCurrentSpace(w3s.spaceDID)

          const cid = await w3sClient.uploadDirectory(
            await filesFromPaths([fullPath.cypher as string])
          )

          if(debug > 0) {
            console.debug(
              `File, "${basePath.cypher}",`
              + `\n  uploaded to Web3.Storage with CID: ${cid}.`
            )
          }

          output[file] = {
            cid: cid.toString(),
            cyphertext: basePath.cypher ?? (
              (() => { throw new Error('¡No cyphertext!') })()
            ),
            get url() {
              return `ipfs://${this.cid}/${this.cyphertext}`
            },
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
    + '\n\nUsage: deno run bin/create-listings.ts <image directory>'
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