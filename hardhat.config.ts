import type { HardhatUserConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatVerify from '@nomicfoundation/hardhat-verify';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers, hardhatVerify],
  /**
   * @dev Build output paths.
   *
   * Defaults match Hardhat conventions (`artifacts/`, `cache/`), but can be overridden
   * via env vars to avoid local permission issues in developer environments.
   */
  paths: {
    artifacts: process.env.HARDHAT_ARTIFACTS_DIR ?? 'artifacts',
    cache: process.env.HARDHAT_CACHE_DIR ?? 'cache',
  },
  /**
   * @dev TypeChain output directory (generated TS bindings).
   * Can be overridden via env var to avoid local permission issues.
   */
  typechain: {
    outDir: process.env.HARDHAT_TYPECHAIN_DIR ?? 'types',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.27',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  chainDescriptors: {
    97: {
      name: 'BSC Testnet',
      chainType: 'l1',
      blockExplorers: {
        etherscan: {
          url: 'https://testnet.bscscan.com',
          apiUrl: 'https://testnet.bscscan.com/v2/api',
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainId: 31337,
    },
    localhost: {
      type: 'http',
      chainId: 31337,
      url: 'http://127.0.0.1:8545/',
    },
    l1a: {
      type: 'http',
      url: 'https://geth-devnet-l1a.coinweb.io',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    l1b: {
      type: 'http',
      url: 'https://geth-devnet-l1b.coinhq.store',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    mainnet: {
      type: 'http',
      url: `https://ethereum-rpc.publicnode.com`,
      // url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    holesky: {
      type: 'http',
      url: 'https://ethereum-holesky.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bsc: {
      type: 'http',
      url: 'https://bnb.coinhq.store',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gas: 'auto',
      gasPrice: 3_000_000_000, // 3 Gwei — BSC minimum is 0.1 Gwei
    },
    bscTest: {
      type: 'http',
      url: 'https://bsc-testnet.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      type: 'http',
      url: 'https://bor.coinhq.store',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
    },
  },
  // gasReporter: {
  //   enabled: true,
  //   currency: "USD",
  //   coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  // },
};

export default config;
