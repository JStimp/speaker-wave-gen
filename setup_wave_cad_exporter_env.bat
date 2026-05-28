@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo ============================================
echo Setting up Wave CAD Exporter environment
echo Python target: 3.12
echo Venv folder: .wave_cad_exporter_venv312
echo ============================================
echo.

where py >nul 2>nul
if errorlevel 1 goto no_py

py -3.12 -V
if errorlevel 1 goto no_py312

if exist ".wave_cad_exporter_venv312" (
    echo Existing environment found: .wave_cad_exporter_venv312
    set /p REBUILD=Delete and rebuild it fresh? [y/N]:
    if /I "%REBUILD%"=="Y" (
        echo Removing old environment...
        rmdir /s /q ".wave_cad_exporter_venv312"
        if errorlevel 1 goto remove_failed
    )
)

if not exist ".wave_cad_exporter_venv312" (
    echo Creating virtual environment...
    py -3.12 -m venv .wave_cad_exporter_venv312
    if errorlevel 1 goto venv_failed
)

set "PYTHON_EXE=.wave_cad_exporter_venv312\Scripts\python.exe"

if not exist "%PYTHON_EXE%" goto no_venv_python

echo.
echo Using Python:
"%PYTHON_EXE%" -c "import sys; print(sys.executable)"
if errorlevel 1 goto python_bad

echo.
echo Upgrading pip...
"%PYTHON_EXE%" -m pip install --upgrade pip
if errorlevel 1 goto pip_upgrade_failed

echo.
echo Removing wrong legacy OCP packages if present...
"%PYTHON_EXE%" -m pip uninstall -y OCP ocp ocp-windows-amd64
echo Legacy package cleanup finished.

echo.
echo Installing required packages...
"%PYTHON_EXE%" -m pip install numpy matplotlib cadquery-ocp
if errorlevel 1 goto package_failed

echo.
echo Verifying imports...
"%PYTHON_EXE%" -c "import sys; print('Python:', sys.version); import numpy; import matplotlib; import OCP; print('OCP OK')"
if errorlevel 1 goto verify_failed

echo.
echo ============================================
echo Setup complete
echo ============================================
echo.
pause
exit /b 0

:no_py
echo ERROR: The Python launcher "py" was not found.
echo Install Python from python.org and make sure the launcher is installed.
echo.
pause
exit /b 1

:no_py312
echo ERROR: Python 3.12 was not found.
echo Install Python 3.12, then run this file again.
echo.
pause
exit /b 1

:remove_failed
echo ERROR: Failed to remove the old venv folder.
echo Close any terminals or apps using it, then try again.
echo.
pause
exit /b 1

:venv_failed
echo ERROR: Failed to create the virtual environment.
echo.
pause
exit /b 1

:no_venv_python
echo ERROR: The venv was created, but python.exe was not found inside it.
echo.
pause
exit /b 1

:python_bad
echo ERROR: The venv Python could not run.
echo.
pause
exit /b 1

:pip_upgrade_failed
echo ERROR: pip upgrade failed.
echo.
pause
exit /b 1

:package_failed
echo ERROR: Package installation failed.
echo.
pause
exit /b 1

:verify_failed
echo ERROR: Import verification failed.
echo.
pause
exit /b 1