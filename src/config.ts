/**
 * Chain + contract configuration for Seer market creation.
 *
 * Address provenance (ethskills rule: never hallucinate an address):
 *  - Seer docs "Deployed contracts": https://seer-3.gitbook.io/seer-documentation/developers/contracts/deployed-contracts
 *  - Gnosis addresses were additionally verified on 2026-09-06 via Blockscout (verified source, contract names match)
 *    and by reading the factory's own getters onchain (see EXPECTED_FACTORY_CONFIG and `npm run verify`).
 *  - `npm run verify` re-checks bytecode + factory getters live before you rely on any of this.
 */
import type { Address, Chain } from "viem";
import { parseUnits } from "viem";
import { base, gnosis, mainnet, optimism } from "viem/chains";

export type ChainId = 100 | 1 | 8453 | 10;

export const CHAINS: Record<ChainId, Chain> = {
  100: gnosis,
  1: mainnet,
  8453: base,
  10: optimism,
};

export const CHAIN_NAMES: Record<ChainId, string> = {
  100: "Gnosis Chain",
  1: "Ethereum Mainnet",
  8453: "Base",
  10: "Optimism",
};

/** Public RPCs (override with RPC_URL). */
export const DEFAULT_RPC: Record<ChainId, string> = {
  100: "https://rpc.gnosischain.com",
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io",
};

/** Native token used for gas AND for Reality.eth bonds (minBond is denominated in this). */
export const NATIVE_SYMBOL: Record<ChainId, string> = {
  100: "xDAI",
  1: "ETH",
  8453: "ETH",
  10: "ETH",
};

export interface SeerAddresses {
  MarketFactory: Address;
  MarketView: Address;
  /** GnosisRouter on Gnosis, MainnetRouter on Ethereum, Router on OP-stack chains. */
  Router: Address;
  RealityProxy: Address;
  MarketImplementation: Address;
}

export const SEER_ADDRESSES: Record<ChainId, SeerAddresses> = {
  100: {
    MarketFactory: "0x83183DA839Ce8228E31Ae41222EaD9EDBb5cDcf1",
    MarketView: "0x95493F3e3F151eD9ee9338a4Fc1f49c00890F59C",
    Router: "0xeC9048b59b3467415b1a38F63416407eA0c70fB8",
    RealityProxy: "0xc260ADfAC11f97c001dC143d2a4F45b98e0f2D6C",
    MarketImplementation: "0x8F76bC35F8C72E5e2Ec55ebED785da5efaa9636a",
  },
  1: {
    MarketFactory: "0x1F728c2fD6a3008935c1446a965a313E657b7904",
    MarketView: "0xB2aB74afe47e6f9D8c392FA15b139Ac02684771a",
    Router: "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6",
    RealityProxy: "0xC72f738e331b6B7A5d77661277074BB60Ca0Ca9E",
    MarketImplementation: "0x8bdC504dC3A05310059c1c67E0A2667309D27B93",
  },
  8453: {
    MarketFactory: "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6",
    MarketView: "0x179d8F8c811B8C759c33809dbc6c5ceDc62D05DD",
    Router: "0x3124e97ebF4c9592A17d40E54623953Ff3c77a73",
    RealityProxy: "0xfE8bF5140F00de6F75BAFa3Ca0f4ebf2084A46B2",
    MarketImplementation: "0xC72f738e331b6B7A5d77661277074BB60Ca0Ca9E",
  },
  10: {
    MarketFactory: "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6",
    MarketView: "0x44921b4c7510Fb306d8E58cF3894fA2bc8a79F00",
    Router: "0x179d8F8c811B8C759c33809dbc6c5ceDc62D05DD",
    RealityProxy: "0xfE8bF5140F00de6F75BAFa3Ca0f4ebf2084A46B2",
    MarketImplementation: "0xAb797C4C6022A401c31543E316D3cd04c67a87fC",
  },
};

/**
 * What the Gnosis MarketFactory reported onchain on 2026-09-06 (block 48113460).
 * `npm run verify` compares the live values against these; a mismatch means the docs or this file are stale.
 */
export const EXPECTED_FACTORY_CONFIG: Partial<
  Record<
    ChainId,
    {
      collateralToken: Address;
      collateralSymbol: string;
      realitio: Address;
      arbitrator: Address;
      conditionalTokens: Address;
      wrapped1155Factory: Address;
      realityProxy: Address;
      market: Address;
      questionTimeout: number;
    }
  >
> = {
  100: {
    collateralToken: "0xaf204776c7245bF4147c2612BF6e5972Ee483701", // sDAI (Gnosis)
    collateralSymbol: "sDAI",
    realitio: "0xE78996A233895bE74a66F451f1019cA9734205cc", // Reality.eth v3.0 (Gnosis)
    arbitrator: "0x68154EA682f95BF582b80Dd6453FA401737491Dc", // Kleros arbitrator proxy used by Seer
    conditionalTokens: "0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce",
    wrapped1155Factory: "0xD194319D1804C1051DD21Ba1Dc931cA72410B79f",
    realityProxy: "0xc260ADfAC11f97c001dC143d2a4F45b98e0f2D6C",
    market: "0x8F76bC35F8C72E5e2Ec55ebED785da5efaa9636a",
    questionTimeout: 302400, // 3.5 days: time after the last answer before a Reality question finalizes
  },
};

/**
 * Minimum Reality.eth bond the official Seer app uses per chain (web/src/lib/config.ts in seer-pm/demo).
 * Denominated in the chain's native token. Lower bonds make the oracle cheaper to attack; do not go below these.
 */
export const DEFAULT_MIN_BOND: Record<ChainId, bigint> = {
  100: parseUnits("10", 18), // 10 xDAI
  1: parseUnits("0.02", 18),
  8453: parseUnits("0.0005", 18),
  10: parseUnits("0.0005", 18),
};

/** Categories accepted by the Seer app (MARKET_CATEGORIES in @seer-pm/sdk). Anything else still works onchain but won't be filterable in the app. */
export const MARKET_CATEGORIES = [
  "elections",
  "politics",
  "business",
  "science",
  "crypto",
  "pop_culture",
  "sports",
  "doge",
  "misc",
  "weather",
] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const MARKET_TYPES = ["categorical", "multi_categorical", "scalar", "multi_scalar"] as const;
export type MarketType = (typeof MARKET_TYPES)[number];

export const FACTORY_FUNCTION: Record<MarketType, "createCategoricalMarket" | "createMultiCategoricalMarket" | "createScalarMarket" | "createMultiScalarMarket"> = {
  categorical: "createCategoricalMarket",
  multi_categorical: "createMultiCategoricalMarket",
  scalar: "createScalarMarket",
  multi_scalar: "createMultiScalarMarket",
};

export function appMarketUrl(chainId: ChainId, market: Address): string {
  return `https://app.seer.pm/markets/${chainId}/${market}`;
}

export function explorerAddressUrl(chainId: ChainId, address: Address): string {
  const bases: Record<ChainId, string> = {
    100: "https://gnosisscan.io/address/",
    1: "https://etherscan.io/address/",
    8453: "https://basescan.org/address/",
    10: "https://optimistic.etherscan.io/address/",
  };
  return bases[chainId] + address;
}

export function explorerTxUrl(chainId: ChainId, hash: string): string {
  const bases: Record<ChainId, string> = {
    100: "https://gnosisscan.io/tx/",
    1: "https://etherscan.io/tx/",
    8453: "https://basescan.org/tx/",
    10: "https://optimistic.etherscan.io/tx/",
  };
  return bases[chainId] + hash;
}

export function realityQuestionUrl(chainId: ChainId, realitio: Address, questionId: string): string {
  return `https://reality.eth.limo/app/#!/network/${chainId}/question/${realitio}-${questionId}`;
}

export function parseChainId(value: string | number | undefined): ChainId {
  const id = Number(value ?? process.env.CHAIN_ID ?? 100);
  if (!(id in CHAINS)) {
    throw new Error(`Unsupported chainId ${id}. Seer runs on 100 (Gnosis), 1 (Ethereum), 8453 (Base), 10 (Optimism).`);
  }
  return id as ChainId;
}
