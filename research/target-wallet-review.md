# NU7 trade proposal — specified wallet only

Prepared September 13, 2026; final execution verified at 09:01 UTC. Both selected trades are confirmed in the specified wallet.

**Wallet:** `0x017859431458cEdac674344f6031d41c9A68a858` on **Optimism, chain 10**. The configured public wallet has been updated to this address. Earlier portfolio analyses using the former configured account are superseded and do not affect this proposal.

**Authorized maximum:** $1,000 total. **Actual spend:** 52 sUSDS, approximately **$57.69**, plus gas. The wallet retains **548 sUSDS**. The maximum is a budget ceiling. It is not a target to fill.

## Funding and execution status

The wallet was funded during preparation. At 08:33 UTC it held **600 sUSDS and 0.0007 ETH** on Optimism, with zero allowance to the Uniswap router. This covers the proposed 52 sUSDS spend plus gas. There were no positions in the fifteen NU7 markets inspected for this wallet. The dollar conversion is approximately 1.109385 USDS per sUSDS, read from Spark's official Optimism rate provider, with the usual USDS dollar-peg assumption. [Official deployment registry](https://github.com/sparkdotfi/spark-address-registry/blob/master/src/Optimism.sol).

Both standard dry runs matched the exact expected wallet. An `eth_simulateV1` simulation of approval, first swap, second approval, and second swap passed all four calls without changing onchain state. The user subsequently explicitly instructed the agent to launch the first trade command; the human signed its approval and swap in Rabby.

**Confirmed first trade:** spent exactly **23 sUSDS**, received **72.743362535311010914 Immediate tokens**, leaving **577 sUSDS** and **zero router allowance**. The signer reports two signed transactions and no queued requests. [Approval transaction](https://optimistic.etherscan.io/tx/0x99eae0d92d58d46e05a6d4f6712d73be092f1e00785b06d5c1883b91cb245561). [Successful swap](https://optimistic.etherscan.io/tx/0x4ea065fc96dfded2ea7bee6e93dba149d23e38799b45a465214993816aaab191).

**Confirmed second trade:** spent exactly **29 sUSDS**, received **69.793565985133580946 February 2031 tokens**, leaving **548 sUSDS**. [Approval transaction](https://optimistic.etherscan.io/tx/0x648b4f3c8e8f702c60f2e643c3d6bd02d1cb41c3914fd62080116552ed357999). [Successful swap](https://optimistic.etherscan.io/tx/0x524358030887df69d4287fc34cd39e74ed76400f10125939a8925cbf57ba0bf0). At 09:01 UTC, onchain verification confirmed both holdings, zero router allowance, latest and pending nonce 4, and no queued signer requests. The wallet retained 0.000699990183659767 ETH. See `target-wallet-execution.json` for final evidence.

The original command stopped after the approval because PublicNode rejected its receipt lookup as an archive request. Optimism's mainnet RPC independently confirmed that approval. A separate recovery helper verified the exact approval, zero outcome holdings, sufficient balance, allowance of exactly 23 sUSDS, and latest/pending nonce 1. It refreshed the quote, preserved the original minimum output, simulated successfully, and queued only the unfinished swap with nonce 1. An exclusive submission record prevents repeating that recovery. The original trade command was not rerun. See `recover-v4-swap-state.json` for the receipt and final balances. Typecheck and chain-10 DEX verification passed again before the recovery.

## Selected trades

| Market and outcome | Route | Spend | Tokens / winning payout in sUSDS | Average fill | Own probability | Blended probability | Quoted edge | Modeled EV |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| [v4 disablement: Immediately at NU7 activation](https://app.seer.pm/markets/10/when-will-v4-transactions-be-disabled-per-the-zcash-nu7-coinholder-poll-2/) | Direct | 23 sUSDS / $25.52 | 72.74336 | 0.316180 | 65% | 38.951% | 7.333 points | +5.33424 sUSDS / +$5.92 |
| [NSM reissuance: February 2031 regardless of Q1](https://app.seer.pm/markets/10/when-will-nsm-reissuance-of-funds-removed-from-circulation-begin-per-the-zcash-n-2/) | Direct | 29 sUSDS / $32.17 | 69.79357 | 0.415511 | 70% | 49.406% | 7.855 points | +5.48194 sUSDS / +$6.08 |

Combined modeled EV is approximately **+$12.00 before gas**. This is a forecast, not guaranteed profit. Worst case is loss of the entire 52 sUSDS, approximately $57.69, plus gas. Each direct purchase pays zero if any other outcome wins, including Invalid. These are speculative positions: the blended probability of winning each individual trade is below 50%.

Quarter-Kelly sizing, the 20% per-market cap, and 15% maximum modeled slippage remain unchanged. For the user's request for a safer allocation, the minimum quoted edge is tightened from 5 to **7 points**, reflecting hidden vote weights, sparse oracle wording and the 0.005 ETH minimum oracle bond. There is no increase in risk limits to force deployment. The next tested sizes—24 sUSDS for v4 and 30 sUSDS for reissuance—fail quarter-Kelly sizing. The selected total is only 5.77% of the dollar budget and well below the unchanged 50% aggregate fleet cap.

Both routes were quoted by the repository engine. Direct purchases are selected. Alternative long and short lines on the same view are not additional positions to stack. The selected direct buys do not retain Invalid tokens.

## All five forecasts and decisions

Probabilities are in each requested market's exact outcome order, including Invalid; every own vector sums to one. Weights were fixed before reconciliation.

| Market | Outcome order | Own vector | Research weight | Blended vector | Decision |
|---|---|---|---:|---|---|
| ZIP-218 | Yes / No / Invalid | .92 / .05 / .03 | .50 | .89970 / .07061 / .02969 | No trade: best tiny Yes+Invalid quote had only about 3.1 points of edge. |
| Issuance smoothing | Smooth / Preserve / Omit / Invalid | .10 / .75 / .12 / .03 | .50 | .12118 / .74094 / .10823 / .02964 | No trade: strongest tiny alternative had about 3.7 points of edge. |
| v4 disablement | Immediate / One year / No date / Invalid | .65 / .10 / .20 / .05 | .25 | .38951 / .17998 / .37985 / .05066 | Proposed 23 sUSDS direct Immediate. |
| Readiness | Ship promptly / Delay / Reject plan / Invalid | .85 / .09 / .02 / .04 | .25 | .76161 / .16770 / .03139 / .03931 | No trade: even a 1-sUSDS direct fill offers only 6.11 points, below the tightened 7-point floor. |
| Reissuance | ASAP / February 2027 / February 2031 / Invalid | .20 / .05 / .70 / .05 | .25 | .33121 / .12470 / .49406 / .05003 | Proposed 29 sUSDS direct February 2031. |

The current spot prices for the selected outcomes are 0.299980 and 0.390141. Final decisions use the higher actual-size fills above. Latest direct quote checks at 180 sUSDS, approximately $199.69, produce modeled EV of **−15.63 sUSDS for v4**, **−17.54 for 2031**, and **−2.36 for readiness**. These direct-route examples demonstrate how larger tickets erode the edge; they are not an optimized full-$1,000 allocation. The complete-set checks found no executable arbitrage, and Invalid has no pool.

## Research, shared risks and settlement

The named poll closes **September 14, 2026 at 19:00 UTC**. The market concerns its selected answer, not actual implementation in 2027 or 2031. Under an immediate correct oracle answer and no challenge, an 84-hour timeout would finish around September 18 at 07:00 UTC. Delays and challenges extend the lockup. [Official announcement](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912).

The current official production vote-summary was refreshed at approximately 08:26 UTC: Q3 ballot splits are 13,053 Immediate, 1,673 One year, 1,191 No date, and 727 Abstain; Q2 splits are 3,443 ASAP, 949 February 2027, 11,176 February 2031, and 1,141 Abstain. These are **ballot pieces, not ZEC weights or independent voters**. Weighted totals remain encrypted. [Live source](https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11), [voting privacy explanation](https://zcashlabs.org/voting).

The one earlier comparable completed coinholder feature round opposed Sprout disablement by 84.6% and issuance smoothing by 83.5%, while supporting fee burning by 80.1%. This is why current public count leads are discounted sharply; earlier concentration is real evidence. The later proposed poll was cancelled. There is no established repeated-question base rate for the exact new choices. [Previous weighted results](https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/).

The current engineering debate supplies a reason for a change in Sprout preferences: developers emphasize legacy security risk, while opponents emphasize inactive holders' rights and compatibility. For reissuance, conservative issuance preferences favor a later date, while informed proponents explicitly favor ASAP. These arguments do not reveal how large holders cast their encrypted weights. [Current discussion](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912?page=2), [ASAP argument](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912/30).

For the two selected markets, retain the default research weight of .25 because market participation is material and traders may be the voters. More-than-25-point own-versus-spot disagreements were checked against the exact current oracle question, official production round and former weighted results. Neither trade is based on confusing the poll winner with eventual implementation.

These two positions share the same poll and oracle process. There is no diversification credit for that shared failure. A 2% common scenario of no usable poll result is already contained within the 5% own Invalid estimates, so it is not added a second time. If both markets resolve Invalid, both direct positions lose their full cost. Other adverse joint outcomes can also lose both positions; the $57.69 total loss is the relevant stress amount. Failed quorum with published results has ambiguous mapping in these short questions, so it is not treated as assured Invalid insurance. [Poll-wide quorum clarification](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912/21).

Fresh MarketView and pool reads at 08:26 UTC found all five requested markets live, no answers, no reported payouts and no arbitration; all ten alternative siblings were drained. Their different Abstain and quorum clauses were read and not imported into the selected markets. The small 0.005 ETH bond and 84-hour timeout matter even if the economic forecast is right.

Mind-changing evidence: an audited weighted result favoring the other side would dominate these forecasts; a major reversal of the public count lead would reduce confidence before close. Do not trade if payout is reported or arbitration starts. Quorum failure or unresolved abstention handling raises Invalid risk. Re-quote immediately before any human execution.

## Exact dry-run requests

These read-only dry runs were performed for the supplied wallet. See `target-wallet-funding.json`, `target-wallet-simulation.json`, and the two September 13 08:30 trade logs for the complete evidence.

```powershell
npm run trade -- 0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6 --chain 10 --outcome 0 --route direct --size 23 --slippage 0.005 --signer metamask --account 0x017859431458cEdac674344f6031d41c9A68a858 --expect-account 0x017859431458cEdac674344f6031d41c9A68a858 --rpc https://optimism-rpc.publicnode.com --dry-run
npm run trade -- 0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c --chain 10 --outcome 2 --route direct --size 29 --slippage 0.005 --signer metamask --account 0x017859431458cEdac674344f6031d41c9A68a858 --expect-account 0x017859431458cEdac674344f6031d41c9A68a858 --rpc https://optimism-rpc.publicnode.com --dry-run
```

Execution is not approved by the existence of these commands. After funding and successful fresh checks, the human starts one signer on chain 10 and approves the concrete plan, then runs any approved sending command exactly once and confirms it in their browser wallet. Never duplicate a sending command.

Validation: repository typecheck passed. A fresh `verify-dex -- --chain 10 --rpc https://optimism-rpc.publicnode.com` completed successfully at approximately 08:33 UTC, including the live factory/quoter check. Direct current onchain MarketView, pool and quote reads succeeded. The funded approval-and-swap simulation passed all four calls at 08:35 UTC. No core trading source code was modified; evidence and read-only research helpers are in this directory.

## Completed continuation

The first trade is complete. Do not run its trade command or its recovery submission again.

The second trade directly purchased February 2031 in the reissuance market for **29 sUSDS**, approximately **$32.17**. After explicit user approval, its command was launched once at 09:00 UTC and both transactions were confirmed by the human in Rabby. The receipt fallback recovered the PublicNode lookup failures for both transactions, allowing the same command to finish successfully. Do not repeat either trade command.

At 08:57 UTC the quote remained 69.793565985133580946 tokens for 29 sUSDS, and a fresh simulated approval plus swap passed. An earlier launch request was rejected by automatic approval review before process creation. The user then explicitly approved this separate second trade; fresh preflight checks found no existing reissuance position or pending transaction, and the successful launch described above followed. The earlier rejected request submitted nothing.

The receipt-handling code is now corrected in `src/tx.ts` and `src/receipt.ts`: it logs a submitted transaction hash immediately, retries failed receipt lookup against the chain's default RPC, checks that fallback's chain ID, and never resends the transaction. A revert still stops the sequence; if both receipt sources fail, the error preserves the hash and tells the operator not to rerun. All six receipt regression tests passed, along with typecheck and Optimism DEX verification. A read-only check of the actual first approval reproduced the original PublicNode failure and recovered its successful receipt using the new code. These changes require no signer restart.
