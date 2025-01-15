// integration/types.ts
import { encodeAbiParameters, keccak256 } from 'viem'

// EIP-712 Domain definition for PolymerArbiter
export const EIP712_DOMAIN = {
  name: 'PolymerArbiter',
  version: '1',
  // Note: chainId will be set dynamically based on deployment
}

// Solidity Order struct definition from PolymerArbiter.sol
export interface Order {
  claimHash: `0x${string}`
  destinationChainId: bigint 
  destinationSettler: `0x${string}`
  token: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
}

// Compact type definition for EIP-712 signing
export const COMPACT_TYPE = [
  { name: 'arbiter', type: 'address' },
  { name: 'sponsor', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expires', type: 'uint256' },
  { name: 'id', type: 'uint256' },
  { name: 'amount', type: 'uint256' }
]

// OnchainCrossChainOrder type definition from ERC7683
export const ONCHAIN_ORDER_TYPE = [
  { name: 'fillDeadline', type: 'uint32' },
  { name: 'orderDataType', type: 'bytes32' },
  { name: 'orderData', type: 'bytes' }
]

// Order type definition for EIP-712 signing
export const ORDER_TYPE = [
  { name: 'claimHash', type: 'bytes32' },
  { name: 'destinationChainId', type: 'uint256' },
  { name: 'destinationSettler', type: 'bytes32' },
  { name: 'token', type: 'address' },
  { name: 'recipient', type: 'address' },
  { name: 'amount', type: 'uint256' }
]

// Constants
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Event definitions for proof verification
export const EVENTS = {
  FILL_EXECUTED: {
    name: 'FillExecuted',
    type: 'event',
    inputs: [
      { indexed: true, name: 'orderId', type: 'bytes32' }
    ]
  },
  OPEN: {
    name: 'Open',
    type: 'event',
    inputs: [
      { indexed: true, name: 'orderId', type: 'bytes32' },
      { indexed: false, name: 'resolvedOrder', type: 'ResolvedCrossChainOrder' }
    ]
  }
}

// Typehash for Order type
export const ORDER_TYPE_HASH = keccak256(
  encodeAbiParameters(
    [{ name: 'Order', type: 'string' }],
    ['Order(bytes32 claimHash,uint256 destinationChainId,bytes32 destinationSettler,address token,address recipient,uint256 amount)']
  )
)
