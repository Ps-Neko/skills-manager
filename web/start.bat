@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
echo Skills Manager is starting... a browser window will open shortly.
echo (Close this window to stop the app.)
echo.
node server\index.js
goto end
:nonode
echo.
echo  Node.js is required. Install it from https://nodejs.org and double-click again.
echo.
:end
pause
