# ZIP-218 independent market assessment, September 13, 2026

Target: https://app.seer.pm/markets/10/will-the-zcash-nu7-coinholder-poll-approve-zip-218-block-spacing-75s-to-25s-per-/
Address: 0xc38fa340cfdc9c758826dd4a8dc15b58728d0418, Optimism chain 10.

Reasoning before numbers: The official active production voting round matches this question exactly. Its live Q4 public ballot-piece counts were 15,170 Yes, 720 No, 751 Abstain, a very large directional Yes lead. These pieces are not ZEC weight or independent holders: every vote is split into 16 pieces, weights stay encrypted, and concentrated holders could reverse the result. ZIP 218's published proposal gives an actionable technical rationale and preserves daily issuance; its forum also contains technical corrections and opposition based on low utilization and reward divisibility. The market resolves the poll's answer, rather than actual implementation. The poll closes September 14 at 19:00 UTC; its official one-million-ZEC participation criterion is poll-wide, but this short market question does not explicitly specify quorum, abstention, or ties. Allow process and resolution ambiguity in Invalid. The previous February coinholder feature round demonstrates strong concentration and divergence from developers, but did not ask this exact faster-block question; a cancelled subsequent poll supplies no completed base rate. No statistically useful repeated-question base rate exists here.

Independent probabilities, in market order: Yes 0.90, No 0.05, Invalid 0.05. Sum 1.00. Decompose as 95% a usable named outcome and 90/95 Yes conditional on that usable result. These are rounded judgements; the ballot shares are not converted to weighted vote probabilities.

What would change the estimate: authenticated weighted preliminary/final totals against Yes would lower Yes by 50 points or more; evidence of inadequate turnout or decryption trouble would increase Invalid by 10-20 points. Evidence that a known dominant holder voted No would lower Yes by 20 points. Final published payouts are a stop condition, not a trading signal.

Reconciliation weight: 0.50 because current open interest is only $115.94 against advertised $2,218.99 liquidity and spot remains near a round 90/10 allocation. Live ballot-piece data is a real independent input. Coinholder weights are hidden and traders may be voters, preventing a higher weight. Creator-model seeding was searched but not independently verified for this specific market; agreement with a model-seeded prior would provide no confirmation.

Primary sources:
- https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912 (organizer, exact Q4, deadline, vote privacy and one-million-ZEC poll-wide participation condition)
- https://voting.valargroup.org/prod/dynamic-voting-config.json (production round authenticated by Valar, Zodl, Tachyon)
- https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11 (fetched live with Node; status 1; end timestamp 1789412400)
- https://zcashlabs.org/voting (privacy, 16 ballot pieces, closing date)
- https://zips.z.cash/zip-0218 (proposal and security considerations)
- https://forum.zcashcommunity.com/t/proposal-lower-zcash-block-target-spacing-to-25s/54577 (actual competing arguments and technical corrections)
- https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/ (February completed feature round, participation and concentration)

Onchain step 0: Yes spot 0.8999, No 0.1020, Invalid has no pool. Both substantive pools live; no answers or reported payout; oracle minimum bond 0.005 ETH, timeout 84 hours. Complete-set split-and-sell at 10 sUSDS loses 0.081 sUSDS; assembling the complete set is unavailable because Invalid has no pool.

Sibling scan: three Optimism questions match ZIP 218 or block spacing; the exact target is the sole tradeable one. The other two have no live pools. No substitution improves available execution.

Planner completed using https://optimism-rpc.publicnode.com after the default RPC failed during a quote. Both operations were read-only. Bankroll 180 sUSDS, quarter Kelly, 20% per-market cap, 15% max slippage, 5-point minimum edge, sizes 1/5/10/25/50/100. Blended rounded probabilities: Yes 0.881, No 0.070, Invalid 0.049. No qualifying trade. The cleanest tiny expression is mint 1 complete set, sell No, retain Yes and Invalid; 0.8987 sUSDS net cost, one token of each retained outcome, 0.930 blended win probability, 3.1-point edge, roughly +0.03 sUSDS EV. This misses the fixed 5-point requirement. At 25 sets the net cost is 22.81 and EV roughly +0.44; at 100 sets the net cost is 93.85 and EV roughly -0.84. Larger deployment worsens the edge. Recommended incremental stake: zero. No transaction was submitted and no trade command was run.
