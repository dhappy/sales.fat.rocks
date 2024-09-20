# TORless Privacy-Preserving Market

This is an exploration into using zero-knowledge & cryptocurrency to develop a private market that doesn't require the TOR network.

## Status

Currently, it consists of a single script, `bin/create-listings.ts` which:

1. strips the EXIF tags from a set of images
2. encrypts them using [Lit Protocol](https://litprotocol.com) to be able to be decrypted by a member of a [Bandada](https://bandada.pse.dev) private group
3. uploads the files *(with the file names changed to their SHA256 hashes)* to [IPFS](https://ipfs.io) via [Web3.Storage](https://web3.stortage)
4. generates a [JSON5](https://json5.org) dump of the original filenames with the associated hashes and CIDs

## Roadmap

* The script currently has the bulk of its parameters hard coded & it needs to be adapted *(likely using [`yargs`](https://yargs.js.org))* to take it's configuration on the command line.

* I need an interface for programatically creating Bandada groups and adding members to them.

* Currently, the script is using Lit's Datil-Dev network which is free. Eventually, I need to support the "Capacity Credit" NFTs which allow use of the mainnet.