@echo off
rem Launch the Hearth downloader GUI with no console window.
cd /d "%~dp0"
start "" pythonw "hearth.py"
