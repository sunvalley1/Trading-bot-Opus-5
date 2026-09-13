# v4 disable market — independent estimate before planning

Recorded 2026-09-12 22:08 UTC (2026-09-13 Tehran), before running `plan`.

Target: https://app.seer.pm/markets/10/when-will-v4-transactions-be-disabled-per-the-zcash-nu7-coinholder-poll-2/
Address: 0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6, Optimism chain 10.

Reasoning first: The official current Q3 has 12,662 public ballot splits for immediate disablement, 1,528 for one year, 1,110 for no date, and 696 abstentions. That is about 83% of non-abstaining splits for immediate disablement. It is useful evidence about direction, but is not the encrypted ZEC-weighted tally; ballots are split into 16 pieces, wallets/holders are not counted, and heavily concentrated holdings can overturn this. The previous completed coinholder sentiment round (February 2026) opposed Sprout disablement by 84.6%; the engineering and ZCAP preference went the other way. Since then, protocol developers have publicly emphasized the risk of legacy Sprout code and advocated immediate removal. This supports a substantial shift toward immediate disablement, discounted heavily for whale and process risk. The exact target question omits abstain, quorum, and tie rules; assume the winning substantive option, with a 5% Invalid allowance for source/resolution ambiguity. Failed quorum is not explicitly assigned to any outcome in this market. Do not confuse the poll winner with actual NU7 implementation timing.

Independent probabilities in market order: Immediately at NU7 activation 0.65; One year after this poll concludes 0.10; Do not set a date to disable v4 transactions 0.20; Invalid 0.05. Sum 1.00. Decomposition: 95% usable substantive result, conditional winner probabilities 65/95, 10/95, 20/95.

Would change my mind: credible current ZEC-weight evidence favoring no-date would move 20–35 points from Immediate toward No-date. Immediate's split share below 60% on a meaningful fresh batch would move 10–15 points away. A published weighted final result removes forecasting uncertainty but would require first checking oracle payout/arbitration and the skill's prohibition on markets with payout already reported. Explicit resolution criteria excluding failed-quorum results would increase Invalid pending verification of quorum.

The greater-than-25-point disagreement with the 30% spot on Immediate was investigated: the exact question references the coinholder poll (not ZCAP or actual activation), real current Valar round matches all options, current weights remain unrevealed, earlier opposite weighted results are real, and creator seeding provenance was searched but not independently confirmed for this specific market. Thus the disagreement has an identifiable source (new split counts versus prior coinholder/market evidence), not a date or outcome-label misread.

Reconciliation weight fixed at w=0.25 before plan: ordinary default because this market's roughly $899 open interest versus $1,810 indexed liquidity is material, no-date has moved from a round seeded price, and actual voters can be better informed. The public count lead is not decisive weighted evidence and does not justify 0.8; this is no longer a near-untraded pool deserving 0.5 merely for thinness.

Primary evidence:
- https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11 (fetched live via Node fetch, status 1; end_time 1789412400 = 2026-09-14 19:00 UTC; test rounds explicitly excluded)
- https://voting.valargroup.org/prod/dynamic-voting-config.json (official round and validator endpoints)
- https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912 (organizers, process, quorum across any one question, current Q3 and rationale)
- https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912?page=2 (developer security arguments and advisory governance distinction)
- https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/ (previous weighted opposition and limited participation)
- https://forum.zcashcommunity.com/t/coinholder-protocol-feature-sentiment-poll/54487?page=3 (prior round concluded Feb 20; no transparent ZEC participated)
- https://forum.zcashcommunity.com/t/do-you-support-deprecating-sprout/49554 (opposition: forgotten holders and immutability; supporting developer arguments)
- https://forum.zcashcommunity.com/t/do-you-support-deprecating-sprout/49554?page=6 (ongoing tradeoff between compatibility and engineering burden)

History coverage: one prior comparable completed coinholder question found (February 2026), an earlier 2024 informal forum poll, and a cancelled May 2026 follow-up. This is not a statistically established repeated-round base rate.

Onchain initial check: all three priced outcome pools live; Invalid has no pool. No answers, no payout reported, no arbitration. Reality minimum bond 0.005 ETH, 84-hour timeout, oracle opened 2026-09-09 despite poll ending Sep 14. Earliest ordinary finalization around 2026-09-18 07:00 UTC if promptly answered after close with no challenge.

Complete-set quote for 10 sUSDS: splitting and selling all available legs loses 0.760 sUSDS; buying a full set is unavailable because Invalid has no pool. No executable forecast-free arbitrage found.
