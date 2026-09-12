# Trading-bot-Opus-5

Forecast-driven trading for [Seer](https://seer.pm) prediction markets. The method, not the code, is the product:

1. **Research** the question until you know what actually decides it.
2. **Estimate** your own probability for every outcome, Invalid included.
3. **Reconcile** your estimate with the market price, weighted by how much you trust each.
4. **Trade** what survives — sized against real quotes, with a human signing every transaction.

The method lives in [`skills/seer-trade-market/SKILL.md`](skills/seer-trade-market/SKILL.md). Claude Code loads it
automatically from `.claude/skills/`; any other agent should read [`AGENTS.md`](AGENTS.md) first. The skill is written
to be run by one agent per market and by different models on the same market, so their estimates can be compared.

**This repository holds no private key and cannot move funds on its own.** It researches, quotes, sizes and
simulates; every transaction is confirmed by a person in their own browser wallet.

## Setup

```bash
npm install
cp .env.example .env
```

Set `CHAIN_ID` to the chain your markets live on (Optimism is `10`) and `SIGNER_WALLET` to your wallet extension.

```bash
npm run verify-dex -- --chain 10
```

Re-checks every router, factory and quoter address against the live chain. Run it before trading on a chain.

## Commands

| Command | Purpose |
|---|---|
| `npm run scan -- "<regex>"` | which markets on a topic are actually tradeable right now, read from the pools rather than the indexer |
| `npm run market -- <ref>` | the question as the oracle sees it, pool prices, real depth, timetable, complete-set arbitrage |
| `npm run odds -- "<keywords>"` | the same question on Polymarket / Kalshi, for a second opinion |
| `npm run plan -- <ref> --own <p,..> --weight <w> --bankroll <X>` | reconcile, quote every route at every size, apply the limits, print the trade that survives |
| `npm run fleet -- <fleet.json> --bankroll <X>` | several markets on one event sized as one position |
| `npm run signer -- --chain <id> --wallet <rabby\|metamask>` | the local page your wallet connects to once per session |
| `npm run trade -- <ref> --outcome <i> --route <r> --size <x> --expect-account 0x.. --dry-run\|--yes` | the only command that spends |
| `npm run watch -- <market...>` | wait for a drained market's liquidity to come back |
| `npm run portfolio -- --account 0x..` | open positions, marked at what they could really exit at |
| `npm run redeem -- <ref> --yes` | cash in once the oracle has finalized |

`<ref>` is a market address, a Seer slug, or a full `app.seer.pm` URL.

## Routes

Every outcome trades in its own thin pool, so there is no single "price" — only a fill for a given size. `plan`
prices three ways to take a position and picks the cheapest:

- **direct** — swap collateral into the outcome's pool.
- **split** — mint a complete set and sell the outcomes you don't want. Far cheaper when the outcome you want is
  cheap: selling into deep sibling pools moves prices much less than buying out of a shallow one.
- **fade** — mint a complete set and sell *only* the outcome you think is overpriced. A short position; it pays
  unless that one outcome wins. On multi-outcome markets it is often the only route with real edge.

## Safety

`npm run trade` refuses to run when:

- the wallet connected in your extension is not `--expect-account`
- the wallet is on a different network than the market
- the wallet already holds a position on this market (pass `--allow-add` to add deliberately — re-running a trade
  command places the trade twice, at a worse fill)
- the market's pools hold no liquidity, or its payout is already reported

It re-quotes at send time and reverts rather than filling more than `--slippage` (default 2%) below the quote.

## Chains

Optimism (10) — Uniswap v3, sUSDS collateral. Gnosis (100) — Swapr v3 (Algebra), sDAI collateral.
