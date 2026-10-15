/**
 * Read-only check of the 20 funded Clément Round 3 children and their parent, straight from the chain.
 *   npx tsx reports/clement-check.ts
 */
import { formatUnits, type Address } from "viem";
import { getPublicClient } from "../src/clients.js";
import { readMarket } from "../src/market-view.js";
import { snapshot } from "../src/trade.js";

const PARENT = "0xacc15cfa0f4ae4932b12ab14595941285098436a" as Address;
const CHILDREN = [
  "0x72917b537875c9dad261140684dc0c9f6ca1ea68", "0x572389e82e409a4a51f10b58f846554f458c4466", "0xa90db19f8ca09689a8f66a13d64884427362b058",
  "0x9c591ee8395580e44cca5b4e448b5c702857d1dc", "0x5fe4134ca8a6e8d15ef792585cd9e66d8564a69d", "0x5311e959d7201dca87294d196a88988d8d7d412b",
  "0x4b3ab1149e17d23555dbfa20dcf4fe612b239824", "0x55476566ee8a736b7d6dc45da1c4e60fb9486245", "0x3f24508c255423eec28af62f3ad0180f3674b976",
  "0xa5d6da5859a34ba12012e25b5d27fa3e4b378131", "0x6844a88042083de8681ef04a8186de9bc57ad05f", "0x56a590730d0f3c995c11c314fdd903b311ff550e",
  "0x62442648c599eebe8a175aa0568b1c0c71dcc3e2", "0xdb0c2dc30a61acadef9a367deb97396c5cb32114", "0x9cd54d7e2c4d6d2b12590f8cf0ac6828594be2a4",
  "0x32707ed352915812fe462e5bd18a3d41d447fb0c", "0xc32110598c798bd4894767b517f933aa5dfa1a4a", "0x8461e8b5ecc43717547c350ab47301fc0794556d",
  "0xf8355cd3c90dbe397b3f4575a05606f60254e297", "0x8b659e9755f203d5597bc59d7a03d1c19604aaf1",
] as Address[];

const client = getPublicClient(100);
const p = await readMarket(client, 100, PARENT);
console.log("PARENT " + p.marketName);
console.log("  templateId " + p.templateId + " (3 = multi-select: several outcomes can win and share the payout)   outcomes " + p.outcomes.length + "   payoutReported " + p.payoutReported);
const rows: string[] = [];
for (const c of CHILDREN) {
  const s = await snapshot(client, 100, c);
  const ok = s.parent && s.parent.market.toLowerCase() === PARENT.toLowerCase();
  const up = s.pools.find((x) => /^up$/i.test(x.outcome));
  const down = s.pools.find((x) => /^down$/i.test(x.outcome));
  const depth = s.pools.filter((x) => x.exists).map((x) => Number(formatUnits(x.collateralBalance, 18)).toFixed(0)).join("/");
  rows.push(
    (ok ? "  " : "  PARENT MISMATCH ") + c + "  outcome " + String(s.parent?.outcomeIndex).padStart(2) + "  " + (s.tradeable ? "LIVE" : "DEAD") +
      "  range " + (s.scalar ? formatUnits(s.scalar.lower, 18) + ".." + formatUnits(s.scalar.upper, 18) : "-") +
      "  DOWN/UP " + (down?.price ?? 0).toFixed(3) + "/" + (up?.price ?? 0).toFixed(3) + "  depth " + depth.padEnd(8) + "  " + (s.parent?.outcome ?? "?"),
  );
}
rows.sort((a, b) => Number(a.match(/outcome\s+(\d+)/)?.[1]) - Number(b.match(/outcome\s+(\d+)/)?.[1]));
for (const r of rows) console.log(r);
