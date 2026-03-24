# PACT SWAP EVM Smart Contracts

Cross-chain–aware **L1 transfer helpers** and related token utilities for PACTSWAP DEX, built for **BNB Smart Chain (BSC)**, **Ethereum** and other **EVM-compatible** networks (and Tron deployments where applicable). Current release **v1.0.2** matches the on-chain deployment set documented below.

---

### PactSwap — quick links

| Resource | Link |
| :-- | :-- |
| **Website** | [pactswap.io](https://pactswap.io) |
| **DEX / App** | [app.pactswap.io](https://app.pactswap.io) |
| **Documentation** | [docs.pactswap.io](https://docs.pactswap.io) |

[![Website](https://img.shields.io/static/v1?label=Website&message=pactswap.io&color=e8e8ed&labelColor=e8e8ed&style=flat&logo=google-chrome&logoColor=1d1d1f)](https://pactswap.io)
[![DEX](https://img.shields.io/static/v1?label=DEX&message=app.pactswap.io&color=e8e8ed&labelColor=e8e8ed&style=flat&logo=ethereum&logoColor=1d1d1f)](https://app.pactswap.io)
[![Docs](https://img.shields.io/static/v1?label=Docs&message=docs.pactswap.io&color=e8e8ed&labelColor=e8e8ed&style=flat&logo=readthedocs&logoColor=1d1d1f)](https://docs.pactswap.io)
[![Solidity](https://img.shields.io/static/v1?label=Solidity&message=0.8.27%20%2F%200.8.28&color=e8e8ed&labelColor=e8e8ed&style=flat&logo=solidity&logoColor=1d1d1f)](./contracts/)

---

## Technology Stack

- **Blockchain**: BNB Smart Chain + EVM-compatible chains (Ethereum, Polygon, Coinweb L1 devnets); Tron (TVM) for selected USDT pairs
- **Smart Contracts**: Solidity 0.8.27 / 0.8.28 (see contract table below)
- **Frontend**: Not in this repository (integrate with ethers.js, viem, wagmi, or TronWeb as needed)
- **Development**: Hardhat 3.x, OpenZeppelin Contracts 5.x, TypeChain, Mocha/Chai

---

## Supported Networks (v1.0.2 deployments)

- **BNB Smart Chain Mainnet** (Chain ID: **56**)
- **Ethereum Mainnet** (Chain ID: **1**)
- **Polygon PoS Mainnet** (Chain ID: **137**)
- **Tron Mainnet** (native **T**-style addresses; JSON-RPC tooling often uses chain ID **728126428**)
- **Coinweb L1a devnet** (Chain ID: **1892**)
- **Coinweb L1b devnet** (Chain ID: **1893**)

---

## Contract Addresses (v1.0.2)

**`C1_EVM`** is the primary **core** router (native gas token) per chain; **`C2_EVM`** is the companion **core** router; **`C1_ERC20_*` / `C2_ERC20_*`** (and the per-asset sections below) are the **token**-side helpers. Application env files map C1/C2 to `L1_CONTRACT_ADDRESS_BASE` and `L1_CONTRACT_ADDRESS_MAKER`.

### Core routers by network

#### Ethereum — Chain ID `1`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `0xED14e2a569e7BB0EDaF92E0cD4C4Dd29Cb84C1Ba` |
| **C2_EVM** (core) | `0x79240a1773C0ff6686F6A3F9741B25e5E14cCC10` |
| **ERC20 helpers** | WCWEB, USDC, USDT, WBTC, USD1 |

#### BNB Smart Chain — Chain ID `56`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `0x124009934c61bC495653C5Ef314a3D0E2b102E09` |
| **C2_EVM** (core) | `0xc9560d92bE095248df7df6d69e827A25Bdc089Ec` |
| **ERC20 helpers** | USDT, WBTC, USDC, USD1 |

#### Polygon — Chain ID `137`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `0x5b50845B94fC47c6172d9ab90845D3613e36Aed5` |
| **C2_EVM** (core) | `0xe6D28e11e2D65439343551127D51770f079a3427` |
| **ERC20 helpers** | USDT |

#### Tron — Chain ID `728126428`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `TL8GBALPSow3APFGxEsM81hvkiQ9tvwtYd` |
| **C2_EVM** (core) | `TUyLddaZZRZvCvZ3HKrJqXcAZKcWLeWXJb` |
| **Notes** | Native TRX row above; **USDT** uses the per-asset L1 pair below |

#### Coinweb L1a devnet — Chain ID `1892`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `0x614Bf6Baf171907204e74b34216A88B4AdCaAF0D` |
| **C2_EVM** | — |
| **ERC20** | Single paired ERC20 helper only |

#### Coinweb L1b devnet — Chain ID `1893`

| Role | Address |
| :-- | :-- |
| **C1_EVM** (core) | `0xA7dd0a32feb5d4Fe745d31CB37D4E41374a583Ab` |
| **C2_EVM** | — |
| **ERC20** | Single paired ERC20 helper only |

---

### Per-asset L1 addresses

Env: **`L1_CONTRACT_ADDRESS_BASE`** (C1) / **`L1_CONTRACT_ADDRESS_MAKER`** (C2). These match v1.0.2 under `deployments/`. **Wrapped BTC** uses `C1_ERC20_WBTC` / `C2_ERC20_WBTC` as **`WBTC_ETH`** (Ethereum) and **`WBTC_BNB`** (BNB Smart Chain).

#### Ethereum mainnet (`1`)

| Asset | L1 (C1 base / C2 maker) |
| :-- | :-- |
| ETH | **C1** `0xED14e2a569e7BB0EDaF92E0cD4C4Dd29Cb84C1Ba`<br>**C2** `0x79240a1773C0ff6686F6A3F9741B25e5E14cCC10` |
| USDT_ETH | **C1** `0x3ea9D2b102f9f7995Aa9dfc20C0b2E6A684617A9`<br>**C2** `0xCbe7165C817441638E2B9E38d1FC72fBD3C34a02` |
| WBTC_ETH | **C1** `0xb96112DB705Bd19ECa6Ca038501270EDB290F805`<br>**C2** `0x4e175B3Bc61e437af893b49c436235AC1137670f` |
| USDC_ETH | **C1** `0x263FdC256E0E36D8dD5eAc1C0911Cc685eeDC8c3`<br>**C2** `0x124009934c61bC495653C5Ef314a3D0E2b102E09` |
| USD1_ETH | **C1** `0x199A7EBa2cEa0D47A22D1500D469DDdFC47C57FC`<br>**C2** `0x9036A48c6c9d00FafD98A9C4E3184C9b31Fce892` |

#### BNB Smart Chain (`56`)

| Asset | L1 (C1 base / C2 maker) |
| :-- | :-- |
| BNB | **C1** `0x124009934c61bC495653C5Ef314a3D0E2b102E09`<br>**C2** `0xc9560d92bE095248df7df6d69e827A25Bdc089Ec` |
| USDT_BNB | **C1** `0x3ea9D2b102f9f7995Aa9dfc20C0b2E6A684617A9`<br>**C2** `0x21F5dE8e4758803ECbD364617c6ae6d503111c10` |
| WBTC_BNB | **C1** `0x9036A48c6c9d00FafD98A9C4E3184C9b31Fce892`<br>**C2** `0x15a9112F8C1B12d6a888ed32178e86F979B4D5aD` |
| USDC_BNB | **C1** `0x4e175B3Bc61e437af893b49c436235AC1137670f`<br>**C2** `0x199A7EBa2cEa0D47A22D1500D469DDdFC47C57FC` |
| USD1_BNB | **C1** `0xCbe7165C817441638E2B9E38d1FC72fBD3C34a02`<br>**C2** `0xb96112DB705Bd19ECa6Ca038501270EDB290F805` |

#### Polygon (`137`)

| Asset | L1 (C1 base / C2 maker) |
| :-- | :-- |
| POL | **C1** `0x5b50845B94fC47c6172d9ab90845D3613e36Aed5`<br>**C2** `0xe6D28e11e2D65439343551127D51770f079a3427` |

#### Tron (`728126428`)

| Asset | L1 (C1 base / C2 maker) |
| :-- | :-- |
| TRX | **C1** `TL8GBALPSow3APFGxEsM81hvkiQ9tvwtYd`<br>**C2** `TUyLddaZZRZvCvZ3HKrJqXcAZKcWLeWXJb` |
| USDT_TRX | **C1** `TBEK242nwxhhtPV4ejrPLmNWFce7FWBouf`<br>**C2** `TNTD343aLLjWsHd2JqxoWTxiRs8tCw8MpK` |

Full per-contract rows (constructor args, deployment hashes, block numbers) live in each network’s `README.md` under `deployments/<network>_1.0.2/`.

---

## Deployments (v1.0.2)

All **v1.0.2** deployment outputs are grouped by network under `deployments/<network>_1.0.2/`. Each logical contract has its own folder (for example `C1_EVM/`, `C2_ERC20_USDT/`) containing **`deployment.json`** (address and metadata), **`abi.json`** / **`abi.txt`**, **`bytecode.txt`**, and optional **`events.txt`**. TypeScript **`index.ts`** at the folder root re-exports addresses and ABIs for app integration.

| Network | Deployment root |
| :-- | :-- |
| Ethereum · chain **1** | [`deployments/mainnet_1.0.2/`](deployments/mainnet_1.0.2/) |
| BNB Smart Chain · **56** | [`deployments/bsc_1.0.2/`](deployments/bsc_1.0.2/) |
| Polygon · **137** | [`deployments/polygon_1.0.2/`](deployments/polygon_1.0.2/) |
| Tron · **728126428** | [`deployments/tron_1.0.2/`](deployments/tron_1.0.2/) |
| L1a devnet · **1892** | [`deployments/l1a_1.0.2/`](deployments/l1a_1.0.2/) |
| L1b devnet · **1893** | [`deployments/l1b_1.0.2/`](deployments/l1b_1.0.2/) |

**Contracts deployed** (by root above):

- **Ethereum:** `C1_EVM`, `C2_EVM`, `C1_ERC20_WCWEB`, `C2_ERC20_WCWEB`, `C1_ERC20_USDC`, `C2_ERC20_USDC`, `C1_ERC20_USDT`, `C2_ERC20_USDT`, `C1_ERC20_WBTC`, `C2_ERC20_WBTC`, `C1_ERC20_USD1`, `C2_ERC20_USD1`
- **BNB Smart Chain:** `C1_EVM`, `C2_EVM`, `C1_ERC20_USDT`, `C2_ERC20_USDT`, `C1_ERC20_WBTC`, `C2_ERC20_WBTC`, `C1_ERC20_USDC`, `C2_ERC20_USDC`, `C1_ERC20_USD1`, `C2_ERC20_USD1`
- **Polygon:** `C1_EVM`, `C2_EVM`, `C1_ERC20_USDT`, `C2_ERC20_USDT`
- **Tron:** `C1_EVM`, `C2_EVM`, `C1_ERC20_USDT`, `C2_ERC20_USDT`
- **L1a:** `C1Evm`, `C1Erc20Bep20` (folders: `C1Evm/`, `C1Erc20Bep20/`)
- **L1b:** `C1Evm`, `C1Erc20Bep20`

On **L1a / L1b**, the Solidity types are the same C1-style ETH and ERC20 forwarders; folder names use the historical `C1Evm` / `C1Erc20Bep20` layout.

---

## On-chain contracts (source of truth, v1.0.2)

| Label (deployment) | Solidity type · role |
| :-- | :-- |
| `C1_EVM` | `C1_EVM` — native ETH transfer with per-(recipient, `l2LinkedId`) accounting, optional calldata in events, fee recipients |
| `C2_EVM` | `C2_EVM` — native ETH; same accounting without calldata payload in events |
| `C1_ERC20_*` | `C1_ERC20_BEP20` — ERC20 forwarding, C1-style events and fees |
| `C2_ERC20_*` | `C2_ERC20_BEP20` — ERC20 forwarding, C2-style events |
| `C1Evm` / `C1Erc20Bep20` | Same types as above; L1a/L1b folder naming in `deployments/` |

---

## Repository contracts (latest sources)

| Contract | Source · compiler · notes |
| :-- | :-- |
| C1 ETH helper | `contracts/C1_EVM.sol` · **0.8.27** — ReentrancyGuard; fee split to aggregators |
| C2 ETH helper | `contracts/C2_EVM.sol` · **0.8.27** — same accounting, no calldata payload in `T` |
| C1 ERC20 helper | `contracts/C1_ERC20_BEP20.sol` · **0.8.27** — SafeERC20; C1 event shape |
| C2 ERC20 helper | `contracts/C2_ERC20_BEP20.sol` · **0.8.27** — SafeERC20; C2 event shape |
| PactSwap token | `contracts/token/PactSwapToken.sol` · **^0.8.28** — ERC20Permit + burnable; not in v1.0.2 L1 table above |
| Fee pool | `contracts/token/FeePoolManager.sol` · **0.8.28** — burn + cross-chain events |

---

## Features

- **Multi-chain L1 coverage**: Ethereum, BSC, Polygon, Tron (USDT), and Coinweb L1 devnets with pinned v1.0.2 addresses
- **ETH and ERC20 paths**: Separate C1/C2 families for event and payload trade-offs
- **Bounded accounting**: Per-key `paid` and `nonce` limits (`maxPayment`, `maxNonce`) for predictable settlement
- **Aggregator fees**: C1 contracts support multiple fee recipients per transfer (where deployed)
- **Security-oriented tests**: Hardhat suite covers fees, bounds, reentrancy, and stress paths (see below)
- **Gas-tuned builds**: Optimizer 200 runs in Hardhat config; gas figures below are measured from tests

---

## Tests

- **Full suite**: `yarn test` — **180** passing (Hardhat Network / EDR, March 2026).
- **C1-focused**: `yarn test:c1:all` — ETH + ERC20 + fees + reentrancy (**85** specs).
- **Gas probes**: `yarn test:gas` — runs only the `Gas` / `Gas Optimizations` examples and prints per-tx `gasUsed` to the console (same transfers as in the table below).

---

## Gas (from test measurements)

All values are **actual `gasUsed`** from transaction receipts on the **Hardhat built-in network** (chain ID **31337**), **Solidity 0.8.27** for C1/C2 helpers, **optimizer 200 runs**. Reproduce the first table with `yarn test:gas` (March 2026 run).

### Per-call `transfer` gas (unit tests)

| Call | Gas used |
| :-- | --: |
| C1_EVM — first ETH (cold, no fee recipients) | 84,191 |
| C1_EVM — second transfer, same `(l2LinkedId, recipient)` (warm) | 49,991 |
| C2_EVM — first ETH (cold) | 59,725 |
| C2_EVM — second transfer, same key (warm) | 42,625 |
| C2_EVM — new `(l2LinkedId, recipient)` key | 59,725 |
| C1_ERC20_BEP20 — first (cold) | 113,733 |
| C1_ERC20_BEP20 — second, same key (warm) | 62,433 |
| C1_ERC20_BEP20 — new `l2LinkedId`, same recipient | 96,633 |
| C2_ERC20_BEP20 — first (cold) | 89,132 |
| C2_ERC20_BEP20 — second, same key (warm) | 54,932 |
| C2_ERC20_BEP20 — new `l2LinkedId` | 72,032 |
| C2_ERC20_BEP20 — `maxAllowedPayment` = amount (“cleanup” path) | 72,032 |

C1 ETH paths with **fee recipients** or **calldata** will differ; C1 reverts and edge cases are not included above.

### Stress suites (avg / min / max over many transfers)

From `C1_EVM.stress.ts`, `C2_EVM.stress.ts`, `C1_ERC20_BEP20.stress.ts`, and `C2_ERC20_BEP20.stress.ts` on the same network (March 2026 run):

| Profile | Avg | Min | Max |
| :-- | --: | --: | --: |
| C1_EVM — warm repeated | ~50,010 | 49,991 | 50,015 |
| C1_EVM — cold / first-touch | ~84,213 | 84,191 | 84,215 |
| C2_EVM — warm sequential | ~42,620 | 42,601 | 42,625 |
| C2_EVM — concurrent-style batch | ~59,711 | 59,689 | 59,713 |
| C1_ERC20_BEP20 — warm | ~62,440 | 62,421 | 62,457 |
| C1_ERC20_BEP20 — mixed cold/warm | ~97,317 | 96,633 | 113,733 |
| C2_ERC20_BEP20 — warm | ~54,915 | 54,896 | 54,932 |
| C2_ERC20_BEP20 — mixed cold/warm | ~72,049 | 71,996 | 89,108 |

### Fee estimate (not from tests)

On any chain, **fee ≈ `gasUsed` × effective gas price** (native gas token). Illustrative **C2_EVM** warm transfer (~**42,625** gas):

| Reference gas price | Approx. fee (ETH or chain-native gas token) |
| :-- | --: |
| 1 gwei | ~0.0000426 |
| 3 gwei | ~0.0001279 |
| 30 gwei | ~0.00128 |

Use live gas prices from your RPC or block explorer; L2s and Tron use different accounting.

---

## Scope (for audit / deep dive)

Contracts of interest under `contracts/`:

- **Transfer helpers**: `C1_EVM.sol`, `C1_ERC20_BEP20.sol`, `C2_EVM.sol`, `C2_ERC20_BEP20.sol`
- **Token + fee pool** (DRAFT): `token/PactSwapToken.sol`, `token/FeePoolManager.sol`, `token/interfaces/IFeePoolManager.sol`

### High-level architecture (C1/C2)

- **Key**: `(recipient r, l2LinkedId l)` → `bytes32 key = keccak256(abi.encode(r, l))`
- **Per key**: cumulative `paid`, monotonic `nonce` (emitted as pre-increment)
- **Bound**: `maxPayment` caps cumulative paid amount; each call adds `msg.value` or ERC20 amount and reverts if exceeded
- Contracts apply **checks-effects-interactions** before external calls; C1 emits `T(...)` with optional calldata for indexing
