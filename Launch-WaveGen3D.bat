@echo off
setlocal

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-windows.ps1"

if errorlevel 1 (
  echo.
  echo WaveGen3D did not start. Read the message above, then press any key to close.
  pause >nul
)

