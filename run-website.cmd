@echo off
setlocal EnableExtensions
title Shubayr local test stack

set "ROOT=%~dp0"
cd /d "%ROOT%"

rem Respect ports already set in the shell or the root .env file. The fallback
rem values match the project's Windows local-test stack.
if defined DB_PORT set "KEEP_DB_PORT=1"
if defined API_PORT set "KEEP_API_PORT=1"
if defined ADMIN_PORT set "KEEP_ADMIN_PORT=1"
if defined ADMINER_PORT set "KEEP_ADMINER_PORT=1"
if defined MAILPIT_UI_PORT set "KEEP_MAILPIT_UI_PORT=1"
if defined MAILPIT_SMTP_PORT set "KEEP_MAILPIT_SMTP_PORT=1"
if defined MEILI_PORT set "KEEP_MEILI_PORT=1"
if defined MINIO_CONSOLE_PORT set "KEEP_MINIO_CONSOLE_PORT=1"

if exist "%ROOT%.env" for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%.env") do (
  if /i "%%A"=="DB_PORT" if not defined KEEP_DB_PORT set "DB_PORT=%%B"
  if /i "%%A"=="API_PORT" if not defined KEEP_API_PORT set "API_PORT=%%B"
  if /i "%%A"=="ADMIN_PORT" if not defined KEEP_ADMIN_PORT set "ADMIN_PORT=%%B"
  if /i "%%A"=="ADMINER_PORT" if not defined KEEP_ADMINER_PORT set "ADMINER_PORT=%%B"
  if /i "%%A"=="MAILPIT_UI_PORT" if not defined KEEP_MAILPIT_UI_PORT set "MAILPIT_UI_PORT=%%B"
  if /i "%%A"=="MAILPIT_SMTP_PORT" if not defined KEEP_MAILPIT_SMTP_PORT set "MAILPIT_SMTP_PORT=%%B"
  if /i "%%A"=="MEILI_PORT" if not defined KEEP_MEILI_PORT set "MEILI_PORT=%%B"
  if /i "%%A"=="MINIO_CONSOLE_PORT" if not defined KEEP_MINIO_CONSOLE_PORT set "MINIO_CONSOLE_PORT=%%B"
)

if not defined DB_PORT set "DB_PORT=55432"
if not defined API_PORT set "API_PORT=8000"
if not defined ADMIN_PORT set "ADMIN_PORT=3200"
if not defined ADMINER_PORT set "ADMINER_PORT=8081"
if not defined MAILPIT_UI_PORT set "MAILPIT_UI_PORT=8025"
if not defined MAILPIT_SMTP_PORT set "MAILPIT_SMTP_PORT=11025"
if not defined MEILI_PORT set "MEILI_PORT=7700"
if not defined MINIO_CONSOLE_PORT set "MINIO_CONSOLE_PORT=9001"

set "WEB_PORT=3000"
set "WEB_URL=http://localhost:%WEB_PORT%"
set "API_URL=http://localhost:%API_PORT%/api/v1"
set "ADMIN_URL=http://localhost:%ADMIN_PORT%"
set "ADMINER_URL=http://localhost:%ADMINER_PORT%"
set "MAILPIT_URL=http://localhost:%MAILPIT_UI_PORT%"
set "SEARCH_URL=http://localhost:%MEILI_PORT%"
set "STORAGE_URL=http://localhost:%MINIO_CONSOLE_PORT%"

echo.
echo ============================================================
echo  Shubayr local test stack
echo ============================================================
echo.

if not exist "%ROOT%docker-compose.yml" (
  echo ERROR: docker-compose.yml was not found beside this launcher.
  goto :fail
)
if not exist "%ROOT%web\package.json" (
  echo ERROR: The web application folder is missing.
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found. Install the current Node.js LTS release.
  goto :fail
)

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker was not found. Install Docker Desktop first.
  goto :fail
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Compose is unavailable. Update Docker Desktop.
  goto :fail
)

if /i "%~1"=="--check" (
  echo Launcher prerequisites are installed.
  echo Docker and the application folders were found.
  exit /b 0
)

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Starting Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
    start "" "%LocalAppData%\Docker\Docker Desktop.exe"
  ) else (
    echo ERROR: Docker Desktop could not be started automatically.
    echo Start Docker Desktop, wait until it is ready, then run this file again.
    goto :fail
  )

  echo Waiting for Docker Desktop to become ready...
  for /l %%I in (1,1,90) do (
    docker info >nul 2>&1
    if not errorlevel 1 goto :docker_ready
    timeout /t 2 /nobreak >nul
  )
  echo ERROR: Docker Desktop did not become ready within three minutes.
  goto :fail
)

:docker_ready
echo Starting PostgreSQL, Redis, search, object storage, Mailpit, API, and Admin...
echo The first run builds images and installs dependencies, so it can take a few minutes.
docker compose --profile full up -d --build
if errorlevel 1 (
  echo.
  echo ERROR: The Docker stack could not be started.
  docker compose --profile full ps
  goto :fail
)

echo.
echo Waiting for the real API to migrate, seed, and become ready...
call :wait_url "%API_URL%/ready" 240
if errorlevel 1 (
  echo.
  echo ERROR: The API did not become ready within four minutes.
  echo Recent API output:
  docker compose logs --tail 100 api
  goto :fail
)

echo Waiting for Web Admin to become ready...
call :wait_url "%ADMIN_URL%/api/health" 180
if errorlevel 1 (
  echo.
  echo ERROR: Web Admin did not become ready within three minutes.
  echo Recent Admin output:
  docker compose logs --tail 100 admin
  goto :fail
)

rem These process variables take priority over a stale web/.env.local and make
rem every storefront domain call the real API rather than test fixtures.
set "NEXT_PUBLIC_API_URL=%API_URL%"
set "NEXT_PUBLIC_USE_MOCKS=false"
set "NEXT_PUBLIC_LIVE_DOMAINS=all"
set "PORT=%WEB_PORT%"

cd /d "%ROOT%web"
if not exist "node_modules\.bin\next.cmd" (
  echo.
  echo Installing storefront dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: Storefront dependency installation failed.
    goto :fail
  )
)

if not exist "node_modules\.bin\next.cmd" (
  echo ERROR: Storefront dependencies are incomplete.
  echo Delete web\node_modules and run this file again.
  goto :fail
)

call :probe "%WEB_URL%"
if not errorlevel 1 (
  echo.
  echo The storefront is already running. Reusing it.
  call :show_ready
  if not defined SHUBAYR_NO_BROWSER (
    start "" "%WEB_URL%"
    start "" "%ADMIN_URL%"
  )
  exit /b 0
)

rem Wait in the background so the browser opens only after Next.js answers.
if not defined SHUBAYR_NO_BROWSER start "" powershell -NoProfile -WindowStyle Hidden -Command "$ProgressPreference='SilentlyContinue'; $deadline=(Get-Date).AddMinutes(3); do { try { $r=Invoke-WebRequest -Uri '%WEB_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -lt 500) { Start-Process '%WEB_URL%'; Start-Sleep -Milliseconds 500; Start-Process '%ADMIN_URL%'; exit } } catch { }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline)"

echo.
call :show_ready
echo Starting the storefront now. Its browser tab opens when it is ready.
echo Press Ctrl+C to stop the storefront dev server.
echo Docker services keep running so your test data is preserved.
echo To stop them later, run: docker compose --profile full stop
echo.

call npm run dev
set "WEB_EXIT=%errorlevel%"
echo.
echo The storefront dev server stopped.
if "%WEB_EXIT%"=="0" exit /b 0
echo If you pressed Ctrl+C, this exit code is expected.
goto :fail

:show_ready
echo ============================================================
echo  Storefront:     %WEB_URL%
echo  Staff Admin:    %ADMIN_URL%
echo  API:            %API_URL%
echo  Mailpit:        %MAILPIT_URL%
echo  Database UI:    %ADMINER_URL%
echo  Search:         %SEARCH_URL%
echo  Storage status: %STORAGE_URL%
echo ============================================================
echo  Admin login:    admin
echo  Admin password: Shubayr-Dev-Admin!2026
echo  Customer phone: +9647700000006
echo  Customer OTP:   000000
echo ============================================================
exit /b 0

:wait_url
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; $uri='%~1'; $deadline=(Get-Date).AddSeconds(%~2); do { try { $r=Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -lt 500) { exit 0 } } catch { }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1" >nul 2>&1
exit /b %errorlevel%

:probe
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -Uri '%~1' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -lt 500) { exit 0 }; exit 1 } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { exit 0 }; exit 1 }" >nul 2>&1
exit /b %errorlevel%

:fail
echo.
pause
exit /b 1
