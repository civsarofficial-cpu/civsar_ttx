@echo off
rem Launcher for the installed build. The console window IS the server status window: it prints
rem the LAN URLs a facilitator reads out to players, and closing it stops the exercise server.
setlocal
title CIVSAR TTX - exercise server  (keep this window open)
cd /d "%~dp0app"
set OPEN_BROWSER=1

echo.
echo   CIVSAR TTX
echo   ----------------------------------------------------------
echo   Starting the exercise server. Your browser will open shortly.
echo   Give players the LAN address below; keep this window open for
echo   the whole exercise. Closing it ends the session for everyone.
echo.

"%~dp0node\node.exe" server.js

echo.
echo   ----------------------------------------------------------
echo   The exercise server has stopped.
echo.
pause
