# NU7 scope and readiness estimate

Recorded September 13, 2026 before reconciliation and sizing; initial pool inspection occurred before the interruption.

Market: `0xc03bf1725b72ab5765b639c582853ede9afb26a6`, Optimism 10.

Oracle question: How will features not ready by the September 30th deadline be handled, per the Zcash NU7 coinholder poll?

Reasoning first: The current production poll's Q5 has a very large public split-count lead for shipping promptly while removing unfinished features: 13,785 versus 1,614 for delay, 258 for rejecting the plan, and 719 abstentions at the latest read. This is about 88% of directional ballot splits, not ZEC-weighted votes or independent people. The official question explicitly asks about the poll's chosen approach; actual implementation by September 30 is not the settlement trigger. The previous proposed May/June poll included a similar readiness choice, but was cancelled, so it supplies no completed outcome. The prior February poll asked feature preferences, not this exact readiness decision: there is no defensible repeated-question numerical base rate. Arguments for prompt deployment focus on removing legacy risk and delivering ready improvements; arguments for waiting concern dependent features and long-term maintenance costs. Hidden large holders, new voting machinery, and short oracle wording require a meaningful probability of delay or an unanswerable result.

Probabilities in oracle order: Ship promptly 0.85; Delay 0.09; Do not support 0.02; Invalid 0.04. Sum exactly 1. Decomposition: 96% usable substantive result, then conditional probabilities 85/96, 9/96, 2/96.

Weight: 0.25. The current public counts support the direction but do not reveal the voting weights. The initial indexed open interest of $542 versus $1,884 liquidity is meaningful trading participation, and voters may know more than this forecaster. Do not give a potentially related model seed independent evidentiary credit. No exact-market GPT-seeding provenance verified.

Would change my mind: credible weighted totals favoring delay would move 30–60 points away from Ship; a sustained directional count lead below 65% would reduce Ship by 10–15 points. A cancelled/unpublished poll would increase Invalid sharply. A published weighted result would substantially narrow uncertainty, subject to a fresh check that payout is not already reported and the oracle is not in arbitration.

The funded user's market has no explicit quorum, abstention, or tie mapping. Do not import the explicit Invalid-on-quorum clause from another sibling. A shared unanswerable-result scenario can be stress-tested as Invalid; a failed-quorum scenario with published results must also be treated as unresolved interpretation, not guaranteed insurance.

Sources:
- [Official production vote-summary](https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11), saved as nu7-vote-summary.json.
- [Organizers' current questions and dates](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912).
- [Question changes and engineering discussion](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912?page=2).
- [Earlier proposed poll and readiness/dependency tradeoffs](https://forum.zcashcommunity.com/t/nu7-sentiment-polling-questions-for-community-review-coinholder-voting-via-zodl/55713).
- [Previous completed polling and concentration limits](https://zfnd.org/nu7-polling-results-what-we-heard-and-where-we-go-from-here/).
- [Voting privacy: sixteen ballot splits and hidden individual weights](https://zcashlabs.org/voting).
