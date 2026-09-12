/**
 * ABIs generated from ../abi/*.json, which were downloaded from Blockscout for the Gnosis deployments
 * (verified source, contract names checked) on 2026-09-06. Same code is deployed on the other chains.
 * Regenerate with `python scripts/gen-abis.py` after refreshing ../abi/*.json.
 */
import type { Abi } from "viem";

export { gnosisRouterAbi, marketAbi, marketFactoryAbi, marketViewAbi, realityProxyAbi, swaprNfpmAbi, swaprRouterAbi } from "./generated-abis.js";

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;
