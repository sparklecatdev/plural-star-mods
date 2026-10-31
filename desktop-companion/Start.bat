@echo off
cd /d "%~dp0"
py -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
.venv\Scripts\python.exe companion.py
if errorlevel 1 goto error
exit /b
:error
pause
