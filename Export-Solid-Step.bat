@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo WaveGen3D Solid STEP Exporter
echo Project folder: %cd%
echo.

set "INPUT_FILE=%~1"
if "%INPUT_FILE%"=="" (
  for /f "usebackq delims=" %%F in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = 'Select WaveGen3D project'; $dialog.Filter = 'WaveGen3D project (*.wavecad.json;*.json)|*.wavecad.json;*.json|All files (*.*)|*.*'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) }"`) do set "INPUT_FILE=%%F"
)

if "%INPUT_FILE%"=="" (
  echo No project selected.
  echo.
  pause
  exit /b 1
)

if not exist "%INPUT_FILE%" (
  echo Project file was not found:
  echo %INPUT_FILE%
  echo.
  pause
  exit /b 1
)

docker --version >nul 2>nul
if errorlevel 1 (
  echo Docker was not found.
  echo Install Docker Desktop, start it, then run this exporter again.
  echo.
  pause
  exit /b 1
)

for %%I in ("%INPUT_FILE%") do (
  set "INPUT_DIR=%%~dpI"
  set "INPUT_NAME=%%~nxI"
)
if "!INPUT_DIR:~-1!"=="\" set "INPUT_DIR=!INPUT_DIR:~0,-1!"

set "OUTPUT_DIR=%cd%\exports"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Input:  %INPUT_FILE%
echo Output: %OUTPUT_DIR%\outer-solid.step
echo.
echo Building Docker image for the CAD-kernel exporter...
docker build -t wavegen3d-solid-step:latest -f "%cd%\solid-step-exporter\Dockerfile" "%cd%\solid-step-exporter"
if errorlevel 1 (
  echo.
  echo Docker build failed.
  pause
  exit /b 1
)

echo.
echo Exporting solid STEP...
echo Mode: auto smooth sew, then faceted solid fallback if needed.
docker run --rm -v "%INPUT_DIR%:/input:ro" -v "%OUTPUT_DIR%:/output" wavegen3d-solid-step:latest "/input/%INPUT_NAME%" --output-dir /output --debug-surfaces --mode auto
if errorlevel 1 (
  echo.
  echo Solid STEP export failed. Check exports\outer-solid.report.json or the message above.
  pause
  exit /b 1
)

echo.
echo Done.
echo Solid STEP: %OUTPUT_DIR%\outer-solid.step
echo Report:     %OUTPUT_DIR%\outer-solid.report.json
echo.
pause
