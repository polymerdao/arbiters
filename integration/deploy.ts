import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimism, base } from 'viem/chains'
import { config } from 'dotenv'
import { readFileSync } from 'fs'

// Load environment variables
config()

import TheCompact from '../out/TheCompact.sol/TheCompact.json' assert { type: 'json' }
import PolymerArbiter from '../out/PolymerArbiter.sol/PolymerArbiter.json' assert { type: 'json' }
import AlwaysOKAllocator from '../out/AlwaysOKAllocator.sol/AlwaysOKAllocator.json' assert { type: 'json' }

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required')
  }

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

  // Initialize clients
  const optimismClient = createWalletClient({
    account,
    chain: optimism,
    transport: http()
  })

  const optimismPublicClient = createPublicClient({
    chain: optimism,
    transport: http()
  })

  const baseClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  })

  const basePublicClient = createPublicClient({
    chain: base,
    transport: http()
  })

  const basePublicClient = createPublicClient({
    chain: base,
    transport: http()
  })

  console.log('Deploying contracts...')

  // 1. Deploy AlwaysOKAllocator to Optimism
  console.log('Deploying AlwaysOKAllocator to Optimism...')
  const allocatorDeployTx = await optimismClient.deployContract({
    abi: AlwaysOKAllocator.abi,
    bytecode: AlwaysOKAllocator.bytecode.object as `0x${string}`,
    args: []
  })

  const allocatorAddress = await optimismPublicClient.waitForTransactionReceipt({ hash: allocatorDeployTx })
  console.log(`AlwaysOKAllocator deployed to: ${allocatorAddress.contractAddress}`)

  // 2. Deploy TheCompact to Optimism
  console.log('Deploying TheCompact to Optimism...')
  const compactDeployTx = await optimismClient.deployContract({
    abi: TheCompact.abi,
    bytecode: TheCompact.bytecode.object as `0x${string}`,
    args: []
  })

  const compactAddress = await optimismPublicClient.waitForTransactionReceipt({ hash: compactDeployTx })
  console.log(`TheCompact deployed to: ${compactAddress}`)

  // 2. Deploy PolymerArbiter to Optimism
  console.log('Deploying PolymerArbiter to Optimism...')
  const optimismArbiterDeployTx = await optimismClient.deployContract({
    abi: PolymerArbiter.abi,
    bytecode: PolymerArbiter.bytecode.object as `0x${string}`,
    args: [
      compactAddress.contractAddress,
      process.env.CROSS_L2_PROVER_ADDRESS
    ]
  })

  const optimismArbiterAddress = await optimismPublicClient.waitForTransactionReceipt({ hash: optimismArbiterDeployTx })
  console.log(`Optimism PolymerArbiter deployed to: ${optimismArbiterAddress}`)

  // 3. Deploy PolymerArbiter to Base
  console.log('Deploying PolymerArbiter to Base...')
  const baseArbiterDeployTx = await baseClient.deployContract({
    abi: ARBITER_ARTIFACT.abi,
    bytecode: ARBITER_ARTIFACT.bytecode.object as `0x${string}`,
    args: [
      '0x0000000000000000000000000000000000000000', // No TheCompact on Base
      '0x0000000000000000000000000000000000000000', // No CrossL2Prover on Base
    ]
  })

  const baseArbiterAddress = await basePublicClient.waitForTransactionReceipt({ hash: baseArbiterDeployTx })
  console.log(`Base PolymerArbiter deployed to: ${baseArbiterAddress}`)

  // Write deployment addresses to file
  const deploymentInfo = {
    optimism: {
      compact: compactAddress.contractAddress,
      arbiter: optimismArbiterAddress.contractAddress,
      alwaysOKAllocator: allocatorAddress.contractAddress
    },
    base: {
      arbiter: baseArbiterAddress.contractAddress
    }
  }

  const fs = require('fs')
  fs.writeFileSync(
    './integration/deployments.json',
    JSON.stringify(deploymentInfo, null, 2)
  )

  console.log('Deployment complete! Addresses saved to deployments.json')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
