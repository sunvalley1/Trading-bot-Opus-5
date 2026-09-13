# NSM issuance smoothing: independent estimate before reconciliation

The live primary vote API has a strong lead in public ballot splits for preserving halvings, while the prior real coinholder feature poll opposed issuance smoothing by 83.5%. This supports preserving halvings as the favorite. The ballot counts are not ZEC weights or independent people, however, and the old binary opposition does not distinguish preserving halvings from omitting smoothing. Technical proponents favor smoothing for simpler accounting; a small group of wealthy voters could overturn the count lead. The market's concise oracle question excludes Abstain without a tie-break or failed-quorum rule, which adds resolution uncertainty.

Own probabilities, in oracle outcome order: Smooth issuance curve 0.10; Preserve halvings 0.75; Do not include issuance smoothing in NU7 0.12; Invalid 0.03. Sum 1.00. Decomposition: 97% probability that the poll yields a usable listed outcome; conditional probabilities approximately 10.3% / 77.3% / 12.4%.

This is a subjective forecast, not a claim that vote-count share equals win probability. Preserve leading in ZEC weight with little time remaining would raise it by 15-20 percentage points; published weighted support for another option or a credible large-voter commitment would cut it by at least 25 points. A confirmed failed quorum or ambiguous official outcome would raise Invalid by 20 points or more. Once payout is reported, the skill prohibits trading.

Evidence:
- https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11 — live status 1, September 14, 2026 19:00 UTC deadline; Q1 ballot_count 3157 / 10135 / 2450 / 658, no total_value fields for this active round.
- https://forum.zcashcommunity.com/t/nu7-polling-results-what-we-heard-and-where-we-go-from-here/54775/1 — one comparable completed early-2026 feature poll; coinholders opposed issuance smoothing 83.5%, supported fee burning 80.1%; ZCAP differed. This is one historical analogue, not a repeated-event frequency.
- https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912 — current poll mechanics, snapshot and dates, proposal wording; quorum applies if any question reaches 1,000,000 ZEC including abstention.
- https://forum.zcashcommunity.com/t/nu7-sentiment-polling-questions-for-community-review-coinholder-voting-via-zodl/55713/14 — implementer explains the simplicity of smoothing versus symbolic value of retaining halvings; the May/June poll was cancelled and must not be counted as a completed round.

Market is the user's no-Abstain version at 0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc on chain 10. Own estimate recorded after the mandatory step-0 snapshot and before running reconciliation or optimizing sizes.
