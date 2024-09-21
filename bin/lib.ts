import fs from 'node:fs'
import { english, generateMnemonic } from 'viem/accounts'
import { debug, mnemonicFile } from './config'

export const getMnemonic = () => {
  let mnemonic
  if(!fs.existsSync(mnemonicFile)) {
    mnemonic = generateMnemonic(english)
    fs.writeFileSync(mnemonicFile, mnemonic.trim())
  } else {
    mnemonic = fs.readFileSync(mnemonicFile, 'utf-8')
  }

  if(debug > 0) {
    console.debug(
      `Using ${mnemonic.split(/ /).length} word mnemonic`
      + ` from \`${mnemonicFile}\`.`
    )
  }

  return mnemonic
}