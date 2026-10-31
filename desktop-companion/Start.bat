@echo off
cd /d "%~dp0"
py companion.py
if errorlevel 1 pause
