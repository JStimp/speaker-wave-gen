@echo off
setlocal

cd /d "%~dp0"
start "" "%~dp0app\index.html"

if errorlevel 1 (
  echo.
  echo WaveGen3D did not start. Make sure app\index.html exists, then press any key to close.
  pause >nul
)
