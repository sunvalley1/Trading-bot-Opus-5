# Which wallet is yours

Four models run this same code side by side, so their results can be compared. **One model, one checkout, one
wallet.** Each bot runs from its own folder, with its own `.env`, and trades only from the wallet listed for it
here. The code is identical in every folder (same git remote, same commit), so the only thing that differs
between the bots is the model.

| Model | Folder | Wallet (Optimism) | Signer port |
|---|---|---|---|
| Fable 5.1 (Claude) | `bots/fable-5.1` | `0xf1b285F65A3174c9D6E062F089c5CD1Ea8cF30D9` | 8572 |
| Opus 5 (Claude) | `bots/opus-5` | `0x6e8211F9059648ee6b88fDCB3dB0415d9015cc9e` | 8573 |
| GPT-6 Astra | `bots/astra-gpt-6b` | `0x017859431458cEdac674344f6031d41c9A68a858` | 8574 |
| GPT-5.6 Sol | `bots/gpt-5.6-sol` | `0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe` | 8575 |

Astra's folder is `astra-gpt-6b` because the security software on this machine quarantined four files inside
the original `astra-gpt-6` and then refused to let anything recreate those paths; the folder was copied to a
clean path and the files restored there. Same model, same wallet, same key.

Pass commands (`PASS_COMMAND` in each folder's `.env`): the Claude bots run
`claude -p --model claude-fable-5-1|claude-opus-5 --allowedTools Bash,Read,Grep,Glob,WebFetch,WebSearch` with a
`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; the GPT bots run
`codex exec -m gpt-6-astra|gpt-5.6-sol --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check`, signed in
through the Codex app's ChatGPT login. Both read the pass prompt from stdin.

## Markets in scope

The experiment trades **exactly the 37 Zcash Q3 2026 Coinholder-Directed Retroactive Grants markets** listed
below, on Optimism (chain 10), and nothing else. Every folder's `.env` names them in `PASS_MARKET_LIST`, the
pass prompt repeats them, and `npm run queue` refuses any other market.

Each asks whether one grant is approved in the Q3 2026 CDRGP poll, which closes **2026-09-16 18:00 UTC**. The
poll runs on the same Valar vote chain as NU7, but this round publishes only the abstain counts, so there is no
live ballot split to read: an estimate has to come from the proposal itself, the amount asked, and the
proposer's record. Reality.eth answers are open already (opening time 2026-08-19), with an 84 h timeout.

| Grant (asked in the Q3 2026 CDRGP poll) | Amount | Address |
|---|---|---|
| ZODL Q1 2026 Core Protocol Development | $1,950,000 | `0x2766ef544445b8247adb241a5c2792aac31ef133` |
| ValarGroup Ironwood Work | $1,203,000 | `0x8dfd98175eaeb4c512113f88eccba1c9bd281742` |
| Orchard Counterfeiting Vulnerability Bug Bounty | $750,000 | `0xd2dc10fa13cac63abfc098e7be89214eba6c38ec` |
| Ironwood zk-SNARK Formal Verification (Project Tachyon) | $738,942 | `0x74a5f36e0af651a1e577b40c2167ac62fd4012d7` |
| Ironwood external audit reimbursement | $599,000 | `0x6a2efde79d7e7df689cb17fd0663b3455d838dd4` |
| Zec.rocks (16 months of uptime) | $584,992 | `0x91736993fd987c230244825a27c3e531c66fe63b` |
| Five Critical Zebra Consensus Divergence Vulnerabilities | $425,000 | `0xe7d2d53d782b13d1de2361ae458367eb3a85b191` |
| Temporary Detectable Unlimited Mint and Sell Exploit | $400,000 | `0xc0e29b80a74287cfef882a4d425d06117aa09c07` |
| CipherScan | $375,000 | `0x73d8a605e090c267d18506a2eeef5b0a6d22fae9` |
| Bonus Grant - Ironwood zk-SNARK Formal Verification | $261,058 | `0xddbe118c992fc4165291ead70b64c33db037eb67` |
| Bonus Grant - Orchard Counterfeiting Bug Bounty | $261,058 | `0xbfa2f5855527b8fa1fdb648065fc172ea41c6d94` |
| Zebra Critical Vulnerability Bug Bounty (CVE-2026-34202) | $150,000 | `0xda375fa265997b5b408fa94d9c834693861bceca` |
| Frontier Compute Zcash Security Research and Remediation Pack | $136,250 | `0x751047dc87049eb122cdbf570a591eceeb81b984` |
| ZcashNames | $122,400 | `0xb6bb6a1e1f02a11afae1de272c94a78bd4673f37` |
| Expanding Zcash In Unstoppable Wallet | $80,000 | `0x404ccb09e7f47de56b64253d9e2f839d555366b8` |
| THORSwap / Metro | $60,000 | `0x777b50f83e76acd9e520abf6a258cc218b1ad054` |
| Nozy Wallet | $60,000 | `0x45ef7f50825619aea0070d7d0147dae5a26fc50b` |
| Zapp | $40,000 | `0x06277fcef6340930b0f08b90032edaf07ce36b6a` |
| Open-Source Zcash Hardware-Wallet SDK | $40,000 | `0xa58c14daf5c0f14adfe08b2c672ab361948758d2` |
| Zafu Browser Extension | $38,000 | `0x725337ef90be0a5a7064098d6a0191d93f8c1b70` |
| CipherPay | $35,000 | `0x0900986e76a3a75ce4dfd3615aaa5e388d1a7870` |
| ZecBooks | $32,000 | `0x140654d12ac41a2d946e6dec85d07a0252b0bf20` |
| ZAP1 Attestation Protocol and Verification Tooling | $28,000 | `0x0586c5bf8a0137d3da895e59663b760b5e39c340` |
| Connaugh Zcash Videos | $22,000 | `0x64a3ab58337ca2d6ddcdd6ab6712b3e57626ee1f` |
| Zecmap | $21,300 | `0x78a72380c7936f2cb3574d2302e8437aeebab93c` |
| Zallet RPC Parity Harness | $20,000 | `0x781fc94cf2a362c29cb08c86f8dcd1ea8181a158` |
| Blindvault | $17,000 | `0x5395fd696b64d1d3e9295e09bfaf038e0c8f05f6` |
| lightwalletd-rs | $10,720 | `0xd058cc42d014810b15a93874b3f11b02bfad9732` |
| CyphZec.com | $10,000 | `0xe3a5794dfdcccbc964574bc6a5e3cab92f198f03` |
| ZecLedger | $10,000 | `0xff4553ad2539b2722b322d10930f1b85969dee6a` |
| Self-Sovereign Zcash Testnet Faucet | $9,280 | `0xb4485e5404178444fbf3f279eddf2b5c4b421e39` |
| Gleyo | $9,081 | `0xace4327ac96e15040474065dc6aa0da0751bcbca` |
| zec-ironwood-reconcile | $8,250 | `0x55094376a3283512a8144fa9a251e430195286e2` |
| zcashtocash via ZcashLabs | $6,000 | `0xdc8cde1236921607e18382710d42de2a8ccdd491` |
| ZecKit Post-M3 Stabilization and Developer Adoption | $5,000 | `0x8f62c36678044f5be39de143c01d652919e59a31` |
| ShieldedScan | $4,060 | `0xbdb8245fb6e4c6df77bb6b28af7c7691572805ec` |
| Zcash Grants Hub | $3,050 | `0xe599669a0cb02128fa0463953f9f70fde240921a` |

The five NU7 markets of the first round are finished and out of scope: their oracle answers are posted and
match the published tally, and the winning tokens can be redeemed after 2026-09-18 20:20 UTC with
`npm run redeem`. Changing the scope is the human's decision, made by editing `PASS_MARKET_LIST` in every
folder and this table.

## Rules for every bot

1. **Find out which model you are** and read `MODEL_NAME` and `LIQUIDITY_WALLET` from `.env`. If `MODEL_NAME`
   is not your model, or `LIQUIDITY_WALLET` is not the address in this table for your model, **stop and say
   so**. You are in the wrong folder. Do not "fix" the `.env`; the human keeps the folders straight.
2. **Always pass your wallet as `--expect-account`** on every `npm run trade`. The command refuses any other
   connected account.
3. **Never trade another model's wallet**, and never read another bot's folder to see what it decided. The
   comparison is only worth anything if each bot reaches its own conclusion from the same public information.
4. **Positions are per wallet.** `npm run portfolio -- --account <your wallet>` is your book and nobody else's.
   Another bot holding the other side of a market is not a reason to trade or not to trade; only your own
   estimate and the price are.
5. **Cadence.** Each bot runs a pass at the times registered by `scripts/schedule-passes.ps1` (`-DailyAt`,
   the human's local time; while a poll is open that can be every two hours until it closes), staggered 20
   minutes apart (Fable first, then Opus, Astra and Sol), so each one reads the others' latest trades as prices and volume. Each pass is the whole skill from
   step 0: look at the pools again (the other bots have moved them), re-check the research, re-estimate, and
   plan. A pass that finds nothing to do ends with "no trade"; that is a complete result and gets recorded like
   any other.
6. **A pass that would add to a position you already hold must say so explicitly** and pass `--allow-add` only
   when the plan sized the addition against the position you already have. Re-running last pass's command is
   not a pass; it is the double-fill the guard exists to refuse.

## Unattended passes

A **pass** is one full run of the skill by this folder's model, started by `npm run pass` (see `PASS.md` for what
the model is told). The model ends its pass by recording each trade it wants with `npm run queue -- add ...`.
It never runs `npm run trade --yes` and never runs the executor. `npm run queue -- execute --yes` is a plain
script with no model in it: it runs the queued trades one at a time through `npm run trade`, with this folder's
wallet as `--expect-account`, discards items older than 150 minutes as stale, and files every result under
`.queue/`. Unattended execution needs `LIQUIDITY_SIGNER=key` and this wallet's `PRIVATE_KEY` in `.env`; with a
browser wallet the executor prints the commands for the human instead. `scripts/schedule-passes.ps1`, run once
by the human, registers a Windows task per folder that runs `npm run pass -- --execute` at the times given in
`-DailyAt` (two a day by default), the bots 20 minutes apart. Registering it is the human's decision; no model
is ever the one pressing `--yes`.

## What the human keeps outside git

`.env` is ignored by git in every folder. It holds the model name, the wallet, the signer port and, if the
experiment runs in key mode, that wallet's `PRIVATE_KEY`. Nothing in this table is secret: wallet addresses
are public onchain. Keys never are, and never go into any file that git tracks.
