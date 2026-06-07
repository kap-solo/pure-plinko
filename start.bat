@echo off
title Pure Plinko — local prototype + mock RGS
cd /d "%~dp0"

echo.
echo Pure Plinko — starting server (static + mock RGS)...
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Node.js not found.
  echo Install from https://nodejs.org/
  pause
  exit /b 1
)

echo Using Node.js
echo.
echo RULE: Keep this black window OPEN while you play.
echo.
echo Opening browser in 2 seconds...
echo URL: http://127.0.0.1:5174/?dev=true^&sessionID=local-demo^&rgs_url=http://127.0.0.1:5174
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5174/?dev=true&sessionID=local-demo&rgs_url=http://127.0.0.1:5174"

node server.mjs
if %errorlevel% neq 0 (
  echo.
  echo ERROR: Server stopped. Port 5174 may already be in use.
  pause
)
