// integration/types.ts
import { encodeAbiParameters } from 'viem'

// EIP-712 Domain definition for PolymerArbiter
export const EIP712_DOMAIN = {
  name: 'PolymerArbiter',
  version: '1',
  // Note: chainId will be set dynamically based on deployment
}

// Order type definition for EIP-712 signing
export const ORDER_TYPE = [
  { name: 'claimHash', type: 'bytes32' },
  { name: 'destinationChainId', type: 'uint256' },
  { name: 'destinationSettler', type: 'bytes32' },
  { name: 'token', type: 'address' },
  { name: 'recipient', type: 'address' },
  { name: 'amount', type: 'uint256' }
]

// Order interface
export interface Order {
  claimHash: `0x${string}`
  destinationChainId: bigint
  destinationSettler: `0x${string}`
  token: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
}

// Helper function to encode Order for TheCompact witness data
export function encodeOrder(order: Order): `0x${string}` {
  return encodeAbiParameters(ORDER_TYPE, [
    order.claimHash,
    order.destinationChainId,
    order.destinationSettler,
    order.token,
    order.recipient,
    order.amount
  ])
}

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
