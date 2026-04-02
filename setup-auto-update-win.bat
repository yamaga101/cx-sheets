@echo off
REM setup-auto-update-win.bat
REM Sheets Tab Manager 自動更新セットアップ（Windows / 管理者権限不要）
REM PowerShell スクリプトを呼び出してタスクスケジューラに登録

powershell -ExecutionPolicy Bypass -File "%~dp0setup-auto-update-win.ps1"
