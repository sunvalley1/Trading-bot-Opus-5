/**
 * Read-only survey of the conditional markets under the parents the user linked (plus the second Clément Round 3
 * parent), straight from the chain: which children have live pools, how deep they are, and whether they traded.
 *   npx tsx reports/gnosis-scope.ts
 */
import { formatUnits, type Address } from "viem";
import { getPublicClient } from "../src/clients.js";
import { searchSeerMarkets } from "../src/seer-api.js";
import { snapshot } from "../src/trade.js";

const PARENTS: Record<string, string> = {
  "0xf094a219f85fc9880362fe096bd489bccb9b5359": "side event -3 (link 1)",
  "0xd1d81ec6c50cac45c9930f31f837b62eedfaefc4": "side event (link 2)",
  "0xb3027df942259e82c40b620daa4fd9f3541bcd4f": "Clement round 3, -5 (link 3)",
  "0xacc15cfa0f4ae4932b12ab14595941285098436a": "Clement round 3, other parent",
};

const client = getPublicClient(100);
const all = await searchSeerMarkets(/./, { chainId: 100 });
const children = all.filter((m) => {
  const pid = String((m as unknown as { parentMarket?: { id?: string } }).parentMarket?.id ?? "").toLowerCase();
  return Number(m.chainId) === 100 && pid in PARENTS;
});
console.log(all.length + " markets scanned, " + children.length + " children under the four parents\n");
for (const [pid, label] of Object.entries(PARENTS)) {
  const kids = children.filter((m) => String((m as unknown as { parentMarket: { id: string } }).parentMarket.id).toLowerCase() === pid);
  console.log("== " + label + "  " + pid + "  (" + kids.length + " children)");
  for (const k of kids) {
    try {
      const s = await snapshot(client, 100, k.id as Address);
      const live = s.pools.filter((p) => p.exists && p.liquidity > 0n);
      const depth = s.pools.filter((p) => p.exists).map((p) => Number(formatUnits(p.collateralBalance, 18)).toFixed(0)).join("/");
      console.log(
        "  " + k.id + "  " + (s.tradeable ? "LIVE " : "dead ") + live.length + "/" + s.pools.filter((p) => p.exists).length + " pools  depth " + (depth || "-").padEnd(9) +
          " spot " + s.pools.map((p) => (p.price ?? 0).toFixed(3)).join("/") + (s.scalar ? "  range " + formatUnits(s.scalar.lower, 18) + ".." + formatUnits(s.scalar.upper, 18) : "") +
          "  " + s.name.slice(0, 70),
      );
    } catch (e) {
      console.log("  " + k.id + "  error " + (e as Error).message.split("\n")[0].slice(0, 100));
    }
  }
  console.log("");
}
