# Which wallet is yours

Four models run this same code side by side, so their results can be compared. **One model, one checkout, one
wallet.** Each bot runs from its own folder, with its own `.env`, and trades only from the wallet listed for it
here. The code is identical in every folder (same git remote, same commit), so the only thing that differs
between the bots is the model.

| Model | Folder | Wallet (Optimism) | Signer port |
|---|---|---|---|
| Fable 5.1 (Claude) | `bots/fable-5.1` | `0xf1b285F65A3174c9D6E062F089c5CD1Ea8cF30D9` | 8572 |
| Opus 5 (Claude) | `bots/opus-5` | `0x6e8211F9059648ee6b88fDCB3dB0415d9015cc9e` | 8573 |
| GPT-6 Astra | `bots/astra-gpt-6` | `0x017859431458cEdac674344f6031d41c9A68a858` | 8574 |
| GPT-5.6 Sol | `bots/gpt-5.6-sol` | `0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe` | 8575 |

Pass commands (`PASS_COMMAND` in each folder's `.env`): the Claude bots run
`claude -p --model claude-fable-5-1|claude-opus-5 --allowedTools Bash,Read,Grep,Glob,WebFetch,WebSearch` with a
`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; the GPT bots run
`codex exec -m gpt-6-astra|gpt-5.6-sol --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check`, signed in
through the Codex app's ChatGPT login. Both read the pass prompt from stdin.

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
5. **Cadence.** Each bot runs a pass every 2 hours, staggered 20 minutes apart (Fable :05, Opus :25, Astra
   :45, Sol 1:05, then again two hours later), so each one reads the others' latest trades as prices and volume. Each pass is the whole skill from
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
by the human, registers a Windows task per folder that runs `npm run pass -- --execute` every 2 hours, the
bots 20 minutes apart. Registering it is the human's decision; no model is ever the one pressing `--yes`.

## What the human keeps outside git

`.env` is ignored by git in every folder. It holds the model name, the wallet, the signer port and, if the
experiment runs in key mode, that wallet's `PRIVATE_KEY`. Nothing in this table is secret: wallet addresses
are public onchain. Keys never are, and never go into any file that git tracks.
