@echo off
cd /d "%~dp0"
where python >nul 2>nul && (python serve_notes.py) || (py serve_notes.py)
pause
