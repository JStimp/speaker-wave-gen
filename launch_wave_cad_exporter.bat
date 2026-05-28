@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PYTHON_EXE=.wave_cad_exporter_venv312\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo Environment not found.
    echo Run setup_wave_cad_exporter_env.bat first.
    echo.
    pause
    exit /b 1
)

echo Launching with:
"%PYTHON_EXE%" -c "import sys; print(sys.executable)"
echo.

"%PYTHON_EXE%" "wave_interference_direct_cad_exporter.py"

if errorlevel 1 (
    echo.
    echo The program exited with an error.
    pause
)

exit /b 0