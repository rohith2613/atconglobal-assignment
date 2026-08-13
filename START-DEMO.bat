@echo off
title Prism - demo server (KEEP THIS WINDOW OPEN)
cd /d "%~dp0"

echo.
echo   ============================================================
echo     PRISM - starting the demo server
echo   ============================================================
echo.
echo   Keep this window open while you record.
echo   Closing it stops the server and the pages will go blank.
echo.

if not exist "node_modules\" (
  echo   First run - installing dependencies. This takes a minute...
  echo.
  call npm install
  echo.
)

echo   Resetting to a clean demo state...
call npx tsx scripts/reset-demo.ts
echo.
echo   Starting the server. Your browser will open in about 15 seconds.
echo.

start "" /b cmd /c "timeout /t 15 /nobreak >nul && start http://localhost:3000"

call npm run dev

echo.
echo   The server has stopped. Press any key to close this window.
pause >nul
