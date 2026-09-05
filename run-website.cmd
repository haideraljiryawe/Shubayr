@echo off
setlocal
title Shubayr Website

set "PORT=3000"
set "URL=http://localhost:%PORT%"

cd /d "%~dp0web"

if not exist package.json (
  echo Could not find the web application folder.
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js 20.9 or newer from https://nodejs.org
  goto :fail
)

rem Is the site already running in another window? Then just open it.
call :probe
if not errorlevel 1 (
  echo The website is already running at %URL%
  start "" "%URL%"
  exit /b 0
)

rem node_modules can exist but be incomplete, so check for the Next.js binary
rem itself instead of just the folder.
if not exist "node_modules\.bin\next.cmd" (
  echo Installing website dependencies. This can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    goto :fail
  )
)

if not exist "node_modules\.bin\next.cmd" (
  echo.
  echo Dependencies are still incomplete.
  echo Delete the web\node_modules folder and run this file again.
  goto :fail
)

rem Open the browser only once the dev server actually answers, otherwise the
rem tab loads before Next.js is listening and shows an offline error page.
start "Shubayr browser" /min powershell -NoProfile -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; exit } catch { if ($_.Exception.Response) { Start-Process '%URL%'; exit } }; Start-Sleep -Seconds 1 }"

echo Starting the Shubayr website at %URL%
echo The browser opens by itself once the server is ready.
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run dev

echo.
echo The dev server stopped.
goto :fail

:probe
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { if ($_.Exception.Response) { exit 0 }; exit 1 }" >nul 2>&1
exit /b %errorlevel%

:fail
echo.
pause
exit /b 1
