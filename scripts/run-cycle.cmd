@echo off
rem Runs whatever the current trading cycle of the bot folder this script sits in (scripts\..) still lacks: its
rem pass on the folder's own chain, then its Gnosis pass, each redone if it failed or never ran (src\cycle.ts).
rem Every day has two cycles, from 11:00 and from 21:00. The SeerBot-* scheduled tasks start this at the bot's
rem slot and again every 30 minutes until the next cycle begins, through "conhost --headless", so no console
rem window opens and nothing on screen can be closed mid-run. Output goes to .passes\scheduler.log.
cd /d "%~dp0.."
if not exist ".passes" mkdir ".passes"
call npm run cycle -- --execute >> ".passes\scheduler.log" 2>&1
