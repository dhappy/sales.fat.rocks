export default {
  inputs:[
    {
      internalType: 'uint256',
      name: 'merkleTreeRoot',
      type: 'uint256',
    },{
      internalType: 'uint256',
      name: 'nullifierHash',
      type: 'uint256',
    },{
      internalType: 'uint256',
      name: 'signal',
      type: 'uint256',
    },{
      internalType: 'uint256',
      name: 'externalNullifier',
      type: 'uint256',
    },{
      internalType: 'uint256[8]',
      name: 'proof',
      type: 'uint256[8]',
    },{
      internalType: 'uint256',
      name: 'merkleTreeDepth',
      type: 'uint256',
    }
  ],
  name: 'verifyProof',
  outputs: [],
  stateMutability: 'view',
  type: 'function',
}
