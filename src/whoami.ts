/**
 * `npm run whoami`
 *
 * The identity check a pass starts with (MODELS.md): which model this folder belongs to, its wallet, its chain,
 * and its markets in scope. It prints those and nothing else. `.env` also holds the wallet's private key and the
 * model CLI's login token, and whatever a model reads is copied into its transcript and sent to its provider; on
 * 18 September three bots' keys were found in their transcripts because the pass told them to read `.env`. So a
 * pass runs this instead, and never opens `.env`.
 */
import "dotenv/config";

const line = (k: string, v: string) => console.log(k.padEnd(20) + v);
line("MODEL_NAME", process.env.MODEL_NAME ?? "(not set)");
line("LIQUIDITY_WALLET", process.env.LIQUIDITY_WALLET ?? "(not set)");
line("CHAIN_ID", process.env.CHAIN_ID ?? "(not set)");
line("LIQUIDITY_SIGNER", process.env.LIQUIDITY_SIGNER ?? "(not set)");
line("PRIVATE_KEY", process.env.PRIVATE_KEY ? "set (never shown)" : "not set");
for (const k of Object.keys(process.env).filter((k) => /^PASS_MARKET_LIST(_\d+)?$/.test(k)).sort()) {
  const n = (process.env[k] ?? "").split(",").filter((s) => s.trim()).length;
  line(k, n + " markets (listed in MODELS.md and in the pass prompt)");
}
