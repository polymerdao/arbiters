import { createPublicClient, createWalletClient, http, parseEther, encodeAbiParameters, encodeEventTopics, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia, baseSepolia } from 'viem/chains'
import { COMPACT_TYPE, ONCHAIN_ORDER_TYPE, Order, ORDER_TYPE, ORDER_TYPE_HASH, ZERO_ADDRESS } from './types'
import { readFileSync } from 'fs'

import TheCompact from '../out/TheCompact.sol/TheCompact.json' assert { type: 'json' }
import PolymerArbiter from '../out/PolymerArbiter.sol/PolymerArbiter.json' assert { type: 'json' }

// keccak256(bytes("Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,uint256 id,uint256 amount)"))
const COMPACT_TYPEHASH = "0xcdca950b17b5efc016b74b912d8527dfba5e404a688cbc3dab16cb943287fec2"

const POLYMER_API_URL = 'https://proof.sepolia.polymer.zone'
const POLYMER_API_KEY = process.env.POLYMER_API_KEY

interface Compact {
  arbiter: `0x${string}`
  sponsor: `0x${string}`
  nonce: bigint
  expires: bigint
  id: bigint
  amount: bigint
}

// Helper functions for proof generation
async function requestReceiptProof(srcChainId: number, dstChainId: number, blockNumber: bigint, txIndex: number) {
  const response = await fetch(POLYMER_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLYMER_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'receipt_requestProof',
      params: [srcChainId, dstChainId, blockNumber, txIndex]
    })
  })
  const data = await response.json()
  return data.result
}

async function queryReceiptProof(jobId: string) {
  const response = await fetch(POLYMER_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLYMER_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'receipt_queryProof',
      params: [jobId]
    })
  })
  const data = await response.json()
  return data.result
}

async function pollForProof(jobId: string, maxAttempts = 30, interval = 2000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryReceiptProof(jobId)

    if (result.status === 'complete') {
      return result.proof
    }

    if (result.status === 'error') {
      throw new Error(`Proof generation failed for jobId ${jobId}`)
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }
  throw new Error('Proof polling timed out')
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required')
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

  // Initialize clients with built-in RPC URLs
  const optimismClient = createWalletClient({
    account,
    chain: optimismSepolia,
    transport: http()
  })

  const optimismPublicClient = createPublicClient({
    chain: optimismSepolia,
    transport: http()
  })

  const baseClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  })

  const basePublicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  })


  // Load deployment addresses
  interface Deployments {
    optimism: {
      compact: `0x${string}`
      arbiter: `0x${string}`
      alwaysOKAllocator: `0x${string}`
    }
    base: {
      arbiter: `0x${string}`
    }
  }

  const deployments = JSON.parse(readFileSync('./integration/deployments.json', 'utf8')) as Deployments

  // Test constants
  const TEST_AMOUNT = parseEther('0.1')
  const DEFAULT_DEADLINE = 2n ** 256n - 1n // Max uint256

  // Step 1: Deposit ETH into TheCompact using AlwaysOKAllocator
  console.log('Depositing ETH into TheCompact...')
  const depositTx = await optimismClient.writeContract({
    address: deployments.optimism.compact,
    abi: TheCompact.abi,
    functionName: 'deposit',
    args: [deployments.optimism.alwaysOKAllocator],
    value: TEST_AMOUNT
  })

  const depositReceipt = await optimismPublicClient.waitForTransactionReceipt({ hash: depositTx })
  if (!depositReceipt.logs[0]?.topics[1]) {
	throw new Error('Failed to get token ID from deposit receipt')
  }
  const tokenId = BigInt(depositReceipt.logs[0].topics[1])
  console.log(`Received ERC6909 token ID: ${tokenId}`)

  // Step 2: Create and register Compact
  const compact: Compact = {
    arbiter: deployments.optimism.arbiter,
    sponsor: account.address,
    nonce: 1n,
    expires: DEFAULT_DEADLINE,
    id: tokenId,
    amount: TEST_AMOUNT
  }

  const compactHash = keccak256(
    encodeAbiParameters(
      COMPACT_TYPE,
      [
        compact.arbiter,
        compact.sponsor,
        compact.nonce,
        compact.expires,
        compact.id,
        compact.amount
      ]
    )
  )

  console.log('Registering Compact...')
  const registerTx = await optimismClient.writeContract({
    address: deployments.optimism.compact,
    abi: TheCompact.abi,
    functionName: 'register',
    args: [compactHash, COMPACT_TYPEHASH, DEFAULT_DEADLINE]
  })
  await optimismPublicClient.waitForTransactionReceipt({ hash: registerTx })
  console.log('Compact registered successfully')

  // Step 3: Create Order and open it on PolymerArbiter
  const order: Order = {
    claimHash: compactHash,
    destinationChainId: BigInt(baseSepolia.id),
    destinationSettler: deployments.base.arbiter as `0x${string}`,
    token: ZERO_ADDRESS as `0x${string}`,
    recipient: account.address,
    amount: TEST_AMOUNT
  }

  // Create OnchainCrossChainOrder
  const onchainOrder = {
    fillDeadline: DEFAULT_DEADLINE,
    orderDataType: ORDER_TYPE_HASH,
    orderData: encodeAbiParameters(ORDER_TYPE, [
      order.claimHash,
      order.destinationChainId,
      order.destinationSettler,
      order.token,
      order.recipient,
      order.amount
    ])
  }

  console.log('Opening order on PolymerArbiter...')
  const openTx = await optimismClient.writeContract({
    address: deployments.optimism.arbiter,
    abi: PolymerArbiter.abi,
    functionName: 'open',
    args: [onchainOrder]
  })
  await optimismPublicClient.waitForTransactionReceipt({ hash: openTx })
  console.log('Order opened successfully')

  // Step 4: Fill order on Base
  console.log('Filling order on Base...')
  const fillTx = await baseClient.writeContract({
    address: deployments.base.arbiter,
    abi: PolymerArbiter.abi,
    functionName: 'fill',
    args: [
      keccak256(onchainOrder.orderData),
      encodeAbiParameters(ONCHAIN_ORDER_TYPE, [onchainOrder]),
      '0x' // No filler data needed
    ],
    value: TEST_AMOUNT
  })

  const fillReceipt = await basePublicClient.waitForTransactionReceipt({ hash: fillTx })

  // Find FillExecuted event
  const fillExecutedTopic = encodeEventTopics({
    abi: PolymerArbiter.abi,
    eventName: 'FillExecuted',
    args: {
      orderId: keccak256(onchainOrder.orderData)
    }
  })

  const logIndex = fillReceipt.logs.findIndex(log => 
    log.address.toLowerCase() === deployments.base.arbiter.toLowerCase() && 
    log.topics[0] === fillExecutedTopic[0]
  )

  if (logIndex === -1) {
    throw new Error('FillExecuted event not found')
  }

  // Get block details
  const block = await basePublicClient.getBlock({
    blockHash: fillReceipt.blockHash
  })


  // Step 5: Get proof from Polymer API
  console.log('Requesting receipt proof...')
  const jobId = await requestReceiptProof(
    baseSepolia.id,
    optimismSepolia.id,
    block.number,
    fillReceipt.transactionIndex
  )
  console.log('Proof job ID:', jobId)

  console.log('Polling for proof completion...')
  const proof = await pollForProof(jobId)
  console.log('Proof received')

  // Encode proof to hex
  const encodeToHex = (s: string): `0x${string}` => {
    const binaryString = atob(s)
    let hexString = ''
    for (let i = 0; i < binaryString.length; i++) {
      const charCode = binaryString.charCodeAt(i)
      const hex = charCode.toString(16).padStart(2, '0')
      hexString += hex
    }
    return `0x${hexString.toUpperCase()}` as `0x${string}`
  }

  const encodedProof = encodeToHex(proof)
  console.log('Proof encoded')

  // Step 6: Submit claim on Optimism
  console.log('Submitting claim on Optimism...')
  const basicClaim = {
    allocatorSignature: '0x', // Not needed for AlwaysOKAllocator
    sponsorSignature: '0x', // Not needed since we registered the compact
    sponsor: account.address,
    nonce: compact.nonce,
    expires: compact.expires,
    id: compact.id,
    allocatedAmount: compact.amount,
    claimant: account.address,
    amount: compact.amount
  }

  const claimTx = await optimismClient.writeContract({
    address: deployments.optimism.arbiter,
    abi: PolymerArbiter.abi,
    functionName: 'claim',
    args: [
      keccak256(onchainOrder.orderData),
      logIndex,
      encodedProof,
      basicClaim
    ]
  })
  await optimismPublicClient.waitForTransactionReceipt({ hash: claimTx })
  console.log('Claim submitted successfully')

  console.log('Integration test completed successfully!')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
