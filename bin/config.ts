import path from 'node:path'
import process from 'node:process'

export const mnemonicFile = path.join(import.meta.dirname, '..', 'mnemonic.txt')

const debugValue = process.env.DEBUG
export const debug = (
  debugValue === 'true' ? 1 : (
    /^\d+$/.test(debugValue ?? '') ? Number(debugValue) : 0
  )
)
if(debug > 0) {
  console.debug(`Debugging Enabled; Level: ${debug}.`)
}

export const w3s = {
  owner: 'dys@dhappy.org',
  spaceDID: 'did:key:z6MkmGU7BNUHaaioarERwjM9XHQSZMjHewvCaSj3XP7T6kHx',
} as const

export const contractAddress = {
  bandada: '0x3889927F0B5Eb1a02C6E2C20b39a1Bd4EAd76131',
} as const
