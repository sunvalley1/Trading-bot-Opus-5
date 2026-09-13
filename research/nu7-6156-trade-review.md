Executed and verified September 13, 2026, 09:24 UTC: bought readiness outcome 0 for 40 sUSDS, approximately $44.38, on Optimism using wallet 0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe. Received exactly 55.866717815989412768 Ship tokens, matching the quote, at 0.7159897979 per token. The wallet now holds 660 sUSDS, zero remaining router allowance and no pending nonce. The other four requested markets were not traded. This is a forecast trade with a possible total loss, not a guaranteed return.

The human approved the proposal and executed the command once, signing both transactions in Rabby. [Approval](https://optimistic.etherscan.io/tx/0x707eadcb187df40c3ed37cc83f49fd7f3473c44425ed1cda15019252bcceff6c) succeeded at block 156846284; [purchase](https://optimistic.etherscan.io/tx/0x922e3728474779e9b1d95f8586f1eee48ceaf53b311b3a5b33c3b0840f0f952a) succeeded at block 156846290. ETH balance fell by 0.000000003954802619 ETH across execution. The quote difference was zero, and no leg reverted. The log's receipt-lookup errors were resolved by the chain's default RPC, whose receipts were independently checked. [Execution record](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-6156-execution.json), [human trade log](C:/Users/12/Desktop/Trading-bot-skill/.trade-logs/2026-09-13T09-22-06-940Z-4840.log).

The remaining text records the pre-trade research and approved plan. Do not repeat the completed trade command.

Final quote and sequential simulation: September 13, 2026, 09:19 UTC. The wallet held 700 sUSDS and 0.0008 ETH, no NU7 outcomes, zero allowance to the Uniswap router and no pending nonce. Its collateral was approximately $776.57. Dollar figures use Spark's live Optimism rate of 1.10938884 USDS per sUSDS, assuming USDS stays near $1. [Official address registry](https://github.com/sparkdotfi/spark-address-registry/blob/master/src/Optimism.sol). The $1,000 authorization is an upper bound, and the funded sizing bankroll is 700 sUSDS.

The official poll closes September 14 at 19:00 UTC. These questions resolve the selected coinholder poll answers, rather than subsequent engineering implementation. Current public ballot pieces are useful evidence but cannot determine encrypted ZEC weights or prove quorum. Each vote is split into 16 pieces. Results follow the close; capital remains exposed through oracle finalization, ordinarily 84 hours after an answer, longer if challenged. [Organizer](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912), [voting explanation](https://zcashlabs.org/voting).

All five exact questions omit explicit quorum, tie and Abstain treatment, and their oracle opened September 9 before the poll ended. Each currently has a minimum bond of 0.005 ETH. Final onchain reads found no payout, no answer and no pending arbitration. Clearer or Abstain-including siblings were read independently and found unfunded; their clauses cannot be transferred into these questions. This combination warrants requiring 8 points of edge instead of the default 5. Quarter Kelly, 20% per-market exposure, 15% price-impact cap and the 50% fleet exposure cap remain intact.

Recorded estimates and reconciliation, in each market's outcome order:

| Market | Own probabilities, Invalid included | Weight | Blended probabilities | Decision |
|---|---|---:|---|---|
| ZIP-218: Yes / No / Invalid | 90% / 5% / 5% | 0.50 | 88.1% / 7.0% / 4.9% | No trade; best tiny Yes+Invalid expression has only about 3.1 points |
| Smoothing: Smooth / Preserve / None / Invalid | 10% / 72% / 14% / 4% | 0.50 | 12.1% / 72.3% / 11.7% / 3.9% | No trade; a tiny None+Invalid split has about 5 points, mostly dependent on Invalid |
| V4: Immediate / One year / No date / Invalid | 60% / 15% / 20% / 5% | 0.25 | 39.6% / 19.1% / 36.4% / 5.0% | No trade; immediate and short No-date fail the 8-point floor |
| Readiness: Ship / Delay / Oppose / Invalid | 85% / 10% / 2% / 3% | 0.50 | 79.77% / 14.51% / 2.73% / 2.99% | Buy Ship directly, 40 sUSDS |
| Reissuance: ASAP / Feb 2027 / Feb 2031 / Invalid | 25% / 10% / 60% / 5% | 0.25 | 32.6% / 13.8% / 48.7% / 4.9% | No trade; even a 1-sUSDS Feb 2031 fill has only 4.3 points |

Own estimates sum to exactly 1. Displayed blended percentages may differ by rounding. Higher weights on ZIP-218, smoothing and readiness reflect direct public poll data against relatively thin, round-priced books, tempered by voters' hidden information. V4 and reissuance have meaningful open interest and price movement; retain the default 0.25 weight. Specific model-seeding provenance was not verified for these pools. Reissuance research inadvertently encountered prior repository report snippets; its source-based estimate is not counted as an uncontaminated independent model check.

The current live ballot pieces favor Preserve, February 2031, Immediate, Yes and Ship respectively. Earlier February weighted coinholders opposed Sprout disablement by 84.6% and smoothing by 83.5%, showing why public count leaders and developer arguments require substantial discounts. Only one completed comparable feature poll was found, while the May follow-up was paused; no calibrated repeated-question win rate is asserted. [Prior weighted results](https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/), [paused follow-up](https://forum.zcashcommunity.com/t/nu7-sentiment-polling-questions-for-community-review-coinholder-voting-via-zodl/55713/73), [live summary](https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11).

The V4 disagreement exceeding 25 points was investigated by rereading the oracle question and the real current poll options, confirming the live deadline, unrevealed weights and contrary prior result. Readiness faces no contradictory dependency on smoothing or the reissuance date: it asks how to handle applicable unfinished features. Evidence of concentrated Delay voting would lower Ship by 15–25 points; reliable weighted confirmation would raise it substantially. New oracle answers, arbitration, drained pools or existing holdings require renewed review before execution.

Exact onchain oracle question for the proposed trade:

> How will features not ready by the September 30th deadline be handled, per the Zcash NU7 coinholder poll?

Market address: 0xc03bf1725b72ab5765b639c582853ede9afb26a6, chain 10. [Requested market](https://app.seer.pm/markets/10/how-will-features-not-ready-by-the-september-30th-deadline-be-handled-per-the-zc-3/).

Retained outcome:

> Ship NU7 as soon as possible, removing any feature not implemented by the September 30th deadline

Trade details:

- Route: direct buy through verified Uniswap v3 contracts. Direct and split routes were compared live.
- Stake: 40 sUSDS, approximately $44.38, plus gas. Gross working capital equals the stake.
- Quote: 55.866717815989412768 tokens at 0.7159897979 sUSDS per token, versus spot 0.6999949444.
- Blended win probability: 0.7977263817; fill-based edge 8.17 points.
- Modeled EV: +4.5663546584 sUSDS, approximately +$5.07. This depends on the forecast being accurate.
- Protected minimum: 55.810851098173423355 tokens, a 0.1% execution tolerance. Maximum permitted fill is 0.7167065044; edge still exceeds 8 points at that minimum.
- If Ship wins: about 55.87 sUSDS gross payout, approximately $61.98, for a $17.60 profit before gas. If Delay, Oppose or Invalid wins: lose the entire 40 sUSDS stake plus gas. This direct route retains no Invalid hedge.
- Quarter-Kelly ceiling at the quoted fill: approximately 50.36 sUSDS. At 50 sUSDS the edge already falls below 8 points. A 40-sUSDS ticket is constrained by live-fill edge and protected execution price.
- Funds left after purchase: 660 sUSDS, approximately $732.20, plus remaining ETH.

Fleet input removes the shared 2% no-usable-tally probability from each unconditional estimate before adding it once. That is a judgmental scenario, not an observed quorum failure rate. It assumes no usable source makes the questions unanswerable and hence Invalid; it does not assume any low-turnout poll automatically resolves Invalid. The default coarse fleet ladder selected 25 sUSDS in readiness and zero elsewhere. A finer ladder at unchanged caps supported 40; sequential simulation then verified that exact size and minimum output. With the refined proposal there is only one position, 5.7% of available collateral, well below the 350-sUSDS fleet cap. Its common-failure loss is the same full 40-sUSDS stake.

Measured readiness curve, with the same forecast:

| Actual net stake (sUSDS) | Route | Fill | Modeled EV (sUSDS) | Clears 8-point edge? |
|---:|---|---:|---:|---|
| 25 | direct | 0.7100 | +3.09 | Yes |
| 40 | direct | 0.7160 | +4.57 | Yes |
| 50 | direct | 0.7200 | +5.40 | No |
| 100 | direct | 0.7399 | +7.82 | No |
| 150 | direct | 0.7598 | +7.49 | No |
| 250 | direct | 0.7996 | -0.58 | No |
| 432.07 | split, 500 sets | 0.8641 | -18.23 | No |

The sampled EV peak is around 100 sUSDS, but that ticket fails the required edge. Forcing larger spending is unsupported. Complete-set checks found no executable arbitrage; Invalid has no pool and selling minted tradable legs returns less than the complete-set cost.

Verification: Optimism verify-dex passed. Typecheck passed. The repository CLI dry-run verified the specified account, balance, quote and needed exact approval. Its isolated swap simulation reverted because allowance is currently zero. A separate eth_simulateV1 sequential simulation with real wallet state and explicit gas/fee/nonce parameters successfully simulated approve 40 sUSDS, the exact protected swap, and final balance reads: 660 sUSDS plus 55.8667 Ship tokens. It uses no balance or allowance overrides and sends nothing. The initial simulation call without explicit gas hit an RPC gas-default error; the corrected read-only simulation passed.

Review evidence: [fleet output](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-fleet-6156-plan.txt), [fine quote ladder](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-readiness-6156-plan.txt), [CLI dry-run](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-readiness-6156-dry-run.txt), [full preflight and simulation](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-readiness-6156-preflight.json), [wallet check](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-wallet-6156.json), [ZIP research](C:/Users/12/Desktop/Trading-bot-skill/research/zip218-independent-2026-09-13.md), [smoothing report](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-smoothing-6156-report.md), [V4 estimate](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-v4-6156-estimate.md), [reissuance report](C:/Users/12/Desktop/Trading-bot-skill/research/nu7-reissuance-6156-report.md). Full oracle questions and final oracle states for all five are in the preflight JSON.

The approved human execution was completed after an immediate refreshed quote at 09:21 UTC. The signer was on chain 10 and configured for Rabby. The signer can be reopened for a future separately approved operation with:

```powershell
npm run signer -- --chain 10 --wallet rabby
```

The completed execution command is preserved in the linked human trade log. It must not be rerun. A new trade or intentional addition needs a separately researched incremental plan and separate human approval. Redemption follows oracle finalization; no redemption has been submitted.
