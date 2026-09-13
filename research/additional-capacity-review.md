# Additional purchase review — September 13, 2026

At approximately 09:06 UTC, the specified wallet retained **548 sUSDS, about $607.94**. The two completed trades cost **52 sUSDS, about $57.69**, plus gas. The $1,000 ceiling remains unchanged. No additional transaction was submitted or queued during this review.

Fresh onchain reads found active pools for the five requested markets, with no reported payouts, arbitration, or bonded answers. Direct, split, and fade quotes were checked across outcomes at sizes 0.1, 1, 10, 50, and 100. A direct size is collateral spent; a split or fade size is complete sets minted, so its net cost can be lower.

| Market | Best sampled additional forecast trade: modeled edge |
|---|---:|
| ZIP-218 | 3.13 percentage points |
| Issuance smoothing | 3.80 points |
| v4 Immediate, retaining Invalid through split | 6.98 points |
| Readiness | 6.15 points |
| NSM February 2031 | 5.15 points |

**None clears the existing 7-point minimum.** The v4 split misses narrowly even at a net cost of only 0.03704 sUSDS for 0.1 sets. Increasing its size worsens the quote. These comparisons already reject additions before any additional portfolio sizing approval; existing exposure must not be reset as though each new order were a first purchase.

For the two held outcomes, the forecasts remain at their pre-trade blended values. Our own buying raised their prices and is not new evidence about the poll result.

| Additional direct purchase | v4 Immediate | NSM February 2031 |
|---|---:|---:|
| 1 sUSDS: modeled edge | 5.55 points | 5.06 points |
| 10 sUSDS: modeled edge | 4.89 points | 4.23 points |
| 100 sUSDS: modeled incremental EV | −4.37 sUSDS | −7.74 sUSDS |

There is a tiny positive split-and-sell pricing discrepancy on ZIP-218. Among 0.1, 0.5, 1, 2, 5, and 10 sets, the best gross quote is **0.0008048 sUSDS profit at 1 set**, less than one tenth of a US cent before gas and execution risk. It is immaterial to the requested allocation; 2 or more sampled sets already lose money before gas.

The public ballot-piece counts were refreshed at 09:06 UTC. Their leaders are unchanged, which does not justify a new forecast or more confidence: the ZEC weights remain hidden. [Official live summary](https://prod.vote-chain-primary.valargroup.org/shielded-vote/v1/vote-summary/16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11). The underlying arguments and distinctions between polling and implementation remain as described in the [official discussion](https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912?page=2).

Conclusion: funds are available, but the refreshed forecast trades do not meet the same cautious execution criteria. Further meaningful deployment needs better quotes or a separately researched opportunity. Full quotes and holdings are in `additional-capacity.json`; current ballot-piece counts are in `nu7-vote-summary-refresh.json`.
