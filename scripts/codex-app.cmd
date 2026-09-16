@echo off
rem Runs the Codex CLI that ships inside the Codex desktop app, forwarding every argument.
rem
rem The npm global install (@openai/codex) can end up with its bin\codex.js missing: npm's extraction of that
rem one file fails with EPERM on this machine, so `codex` disappears from PATH and a pass dies with
rem MODULE_NOT_FOUND. The app keeps its own copy of the same CLI under a content-hashed folder that changes
rem with each app update, so this picks the newest one instead of hard-coding the hash.
rem
rem Point a bot's PASS_COMMAND at this file: PASS_COMMAND=scripts\codex-app.cmd exec -m <model> ...
setlocal
set "CODEX_EXE="
for /f "delims=" %%D in ('dir /b /o-d "%LOCALAPPDATA%\OpenAI\Codex\bin" 2^>nul') do (
  if not defined CODEX_EXE if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\%%D\codex.exe" set "CODEX_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\%%D\codex.exe"
)
if not defined CODEX_EXE (
  echo scripts\codex-app.cmd: no codex.exe under "%LOCALAPPDATA%\OpenAI\Codex\bin". Install the Codex app, or repair the npm CLI with: npm i -g @openai/codex 1>&2
  exit /b 127
)
"%CODEX_EXE%" %*
