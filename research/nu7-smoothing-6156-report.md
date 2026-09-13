MARKET     Which NSM issuance smoothing approach will be selected in the Zcash NU7 coinholder poll?
           https://app.seer.pm/markets/10/which-nsm-issuance-smoothing-approach-will-be-selected-in-the-zcash-nu7-coinhold-2/
           0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc   chain 10
           Oracle outcomes: Smooth issuance curve; Preserve halvings; Do not include issuance smoothing in NU7; Invalid result.
RESOLVES   Official NU7 coinholder poll closes 2026-09-14 19:00 UTC; weighted result follows shortly afterward. Reality question has been open since September 9, has no answers and no reported payout, and has an 84-hour challenge timeout after an answer. Official source: https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912

RESEARCH
  1. At approximately 2026-09-13 09:12 UTC, production round status remains 1 (active). Q1 public ballot pieces: Smooth 3295, Preserve 10381, None 2757, Abstain 676. Preserve holds 63.2% of non-abstaining pieces. Final ZEC weights are not published. https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11
  2. Votes are split into 16 unlinkable encrypted ballots. Piece counts cannot be treated as independent voters or weighted ZEC totals. https://zcashlabs.org/voting
  3. Official prior NU7 coinholder sentiment showed 83.5% opposition to issuance smoothing. This supports preserving existing issuance preferences, but the prior binary question did not distinguish Preserve from None. Only one directly comparable completed prior poll was located; the planned May/June poll was cancelled and contributes no outcome observation. https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/ ; https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912
  4. Smooth advocates argue for simpler implementation and a gradual miner subsidy; Preserve retains the symbolism and schedule of halvings. Engineers are prepared to implement either. https://forum.zcashcommunity.com/t/nu7-sentiment-polling-questions-for-community-review-coinholder-voting-via-zodl/55713/14
  5. Official participation threshold is 1,000,000 ZEC in any one question, including abstentions. The supplied oracle question contains no explicit quorum or Abstain treatment; its minimum bond is only 0.005 ETH. A clearer sibling explicitly handles quorum and Abstain, but scanning found it unfunded; the Abstain-including sibling is also unfunded. https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912/21 ; onchain `npm run market` and `npm run scan -- "NSM issuance smoothing" --all`.
  Known: deadline, eligible snapshot, public piece leader, previous weighted opposition to smoothing. Open: final encrypted weights, total ZEC participation, final official interpretation.

ESTIMATE   Smooth issuance curve: 0.10   Preserve halvings: 0.72   Do not include issuance smoothing in NU7: 0.14   Invalid: 0.04   (sum 1.00)
  reasoning: 96% usable listed answer, with conditional probabilities approximately 10.4% / 75.0% / 14.6%. Preserve is clearly favored by live pieces and earlier holder preferences, while encrypted weights and substantial support for None limit confidence. Invalid includes approximately 3% common process/publication uncertainty and 1% additional wording risk.
  would change my mind: verified weighted Preserve leader would lift Preserve toward 0.96; verified failure of the participation threshold would sharply increase Invalid subject to the supplied generic wording. A large eligible smoothing-aligned holder participating could move 10 to 20 points from Preserve to Smooth.

MARKET PRICE  Smooth: 0.1504   Preserve: 0.7498   None: 0.1000   Invalid: no pool
              open interest $356.31 vs indexed liquidity $2183.35; all three pools have live liquidity, each approximately 320.13 outcome tokens, and collateral depth 50.31 / 1603.56 / 26.00 sUSDS.
CONFIDENCE    w = 0.5 because current primary observations and earlier weighted sentiment deserve meaningful weight against round prices and thin open interest. The holders themselves may know hidden voting weights, preventing a higher weight. No primary evidence establishes that this exact market's price was GPT-seeded, and model agreement adds no evidence.
BLENDED       Smooth: 0.121   Preserve: 0.723   None: 0.117   Invalid: 0.039   (rounded sum 1.000)

TRADE      no trade recommended under the user's safer preference.
  route none   stake 0   fill n/a   edge n/a   EV 0
  The ordinary 5-point planner admits only a tiny alternative: mint 10 complete sets, sell Smooth and Preserve, keep None and Invalid. Gross working capital 10 sUSDS, net cost approximately 1.06 sUSDS, fill 0.1056, blended p(win)15.6%, edge5.0 points, EV+0.50 sUSDS. It pays 10 sUSDS if None or Invalid wins, and otherwise loses the 1.06 net stake plus gas. At 25 sets the fill rises to0.1139, edge falls to4.2 points, and the default floor rejects it. Larger positions quickly lose edge.
  Most of that tiny candidate's edge comes from estimated Invalid probability; an 8-point required edge is appropriate for the low bond and generic question. Every quoted long and fade falls below that stricter floor. A fresh 8-point replan hit RPC rate limiting, but the completed ordinary ladder establishes the maximum immediate edge was only5.5 points. No trade command or transaction was run.
  worst case for recommended no trade: no loss or capital lockup.
  limited by: thin pool depth, uncertain oracle hedge, and required edge.

RISKS      A few large holders can reverse the leader in encrypted ZEC weight; expanded wallet participation changes the prior electorate; failed quorum or ambiguous generic wording can resolve differently than expected. Capital in any executed trade remains locked through the 84-hour oracle timeout after a result is answered.
