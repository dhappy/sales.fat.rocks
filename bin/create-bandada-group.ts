import crypto from 'node:crypto'
import {
  createConfig,
  http,
  waitForTransactionReceipt,
  getBalance,
} from '@wagmi/core'
import { sepolia } from '@wagmi/chains'
import {
  createWalletClient,
  publicActions,
  parseEventLogs,
  parseTransaction,
} from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import JSON5 from 'json5'
import { getMnemonic } from './lib'
import { contractAddress, debug } from './config'
import bandadaABI from '../src/bandadaGroupABI.json'

const config = createConfig({
  chains: [sepolia],
  client({ chain }) {
    return createWalletClient({ chain, transport: http() })
  },
})

const account = mnemonicToAccount(getMnemonic())
const { formatted: balance } = await getBalance(
  config, { address: account.address },
)

if(debug > 0) {
  console.debug({ wallet: account.address, balance })
}

const client = (
  createWalletClient({
    chain: sepolia,
    transport: http(),
  })
).extend(publicActions)

const holder = new Uint8Array(32)
crypto.getRandomValues(holder)
const asHex = holder.reduce((out, val) => (
  `${out}${val.toString(16).padStart(2, '0')}`
), '')
const groupId = BigInt(`0x${asHex}`)

const treeDepth = 16n

if(debug > 0) console.debug({ groupId, treeDepth })

try {
  const hash = await client.writeContract({
    account,
    abi: bandadaABI,
    address: contractAddress.bandada,
    functionName: 'createGroup',
    args: [
      groupId,
      treeDepth,
      account.address,
    ],
  })

  if(debug > 0) console.debug({ 'Waiting On': hash })

  const { logs: rawLogs } = (
    await waitForTransactionReceipt(config, { hash })
  )

  const [{ data, topics: [, topicTwo] }] = parseEventLogs({
    abi: bandadaABI,
    logs: rawLogs,
    eventName: 'GroupCreated',
  })

  const [, depth, zero] = Array.from(data.match(/(.{66})(.+)/) ?? [])

  if(debug > 0) {
    console.debug({
      groupId: BigInt(topicTwo ?? 0),
      treeDepth: BigInt(depth),
      zero: `0x${zero}`,
    })
  }
} catch(error) {
  console.error({ error: error.shortMessage ?? error.message })
}