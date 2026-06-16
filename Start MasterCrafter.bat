@echo off
setlocal

pushd "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found on PATH.
  echo Install Node.js and make sure npm is available before starting MasterCrafter.
  pause
  popd
  exit /b 1
)

if not exist node_modules (
  echo Dependencies are missing. Run npm install first.
  pause
  popd
  exit /b 1
)

echo Starting MasterCrafter...
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo MasterCrafter stopped with exit code %EXIT_CODE%.
  pause
)

popd
exit /b %EXIT_CODE%
