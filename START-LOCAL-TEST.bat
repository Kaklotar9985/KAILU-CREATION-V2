@echo off
setlocal
cd /d "%~dp0"

echo KAILU CREATION - Local Excel Sync Test
if not exist "Kailu Creation Catalog List.xlsx" (
  echo.
  echo ERROR: Kailu Creation Catalog List.xlsx is missing from this folder.
  echo Copy your saved Excel workbook into this same folder and run this file again.
  echo.
  pause
  exit /b 1
)
where py >nul 2>&1
if not errorlevel 1 (
  start "KAILU CREATION Local Test Server" cmd /k "cd /d ""%~dp0"" && py -m http.server 8765 --bind 127.0.0.1"
  goto :openbrowser
)
where python >nul 2>&1
if not errorlevel 1 (
  start "KAILU CREATION Local Test Server" cmd /k "cd /d ""%~dp0"" && python -m http.server 8765 --bind 127.0.0.1"
  goto :openbrowser
)
echo.
echo Python is not installed or not available in PATH.
echo Install Python, or open this folder in VS Code and use Live Server.
echo Excel sync will NOT work reliably by double-clicking index.html.
echo.
pause
exit /b 1

:openbrowser
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/"
echo.
echo Website opened at http://127.0.0.1:8765/
echo To stop the local server, close the server command window or press Ctrl+C there.
echo When you edit the Excel workbook, save it in this SAME folder and press Ctrl+F5 in the browser.
pause
