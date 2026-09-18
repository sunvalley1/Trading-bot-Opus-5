@echo off
rem Runs the scheduled passes for the bot folder this script sits in (scripts\..) and appends all output to
rem .passes\scheduler.log: first the folder's own chain (CHAIN_ID, Optimism), then Gnosis (chain 100), which does
rem nothing unless this folder's .env sets PASS_MARKET_LIST_100. One after the other, never together: each pass
rem executes its own chain's queue at the end, and two executors on one wallet must not overlap. The SeerBot-*
rem scheduled tasks start this through "conhost --headless", so no console window opens and nothing on screen
rem can be closed or Ctrl+C'd while a pass or a trade is running.
cd /d "%~dp0.."
if not exist ".passes" mkdir ".passes"
call npm run pass -- --execute >> ".passes\scheduler.log" 2>&1
call npm run pass -- --chain 100 --execute >> ".passes\scheduler.log" 2>&1
