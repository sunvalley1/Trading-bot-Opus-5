@echo off
rem Runs one scheduled pass for the bot folder this script sits in (scripts\..) and appends all output to
rem .passes\scheduler.log. The SeerBot-* scheduled tasks start it through "conhost --headless", so no console
rem window opens and nothing on screen can be closed or Ctrl+C'd while a pass or a trade is running.
cd /d "%~dp0.."
if not exist ".passes" mkdir ".passes"
call npm run pass -- --execute >> ".passes\scheduler.log" 2>&1
