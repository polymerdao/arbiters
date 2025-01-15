export const CHAIN_CONFIG = {
  optimism: {
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    hyperlane: {
      dispatcher: '0x...',
      executor: '0x...'
    }
  },
  base: {
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    hyperlane: {
      dispatcher: '0x...',
      executor: '0x...'
    }
  }
}

export const DEPLOYMENT_CONFIG = {
  compact: {
    bytecode: '0x...', // TheCompact bytecode
    abi: [] // TheCompact ABI
  },
  arbiter: {
    bytecode: '0x...', // PolymerArbiter bytecode
    abi: [] // PolymerArbiter ABI
  }
}
