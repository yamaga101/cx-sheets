@echo off
REM auto-update.bat
REM Sheets Tab Manager Chrome拡張機能の自動更新スクリプト（Windows用）
REM リポジトリを定期的に git pull して最新に保つ
REM auto-reload.ts がバージョン変更を検知 → Chrome拡張を自動リロード

setlocal
set "SCRIPT_DIR=%~dp0"
set "LOG_FILE=%SCRIPT_DIR%auto-update.log"

REM ローカル変更チェック
git -C "%SCRIPT_DIR%" status --porcelain 2>nul | findstr /r "." >nul
if %errorlevel% equ 0 (
    echo [%date% %time%] SKIP: ローカルに未コミットの変更があるためスキップ >> "%LOG_FILE%"
    exit /b 0
)

REM git pull 実行
for /f "delims=" %%i in ('git -C "%SCRIPT_DIR%" pull --ff-only 2^>^&1') do set "RESULT=%%i"

if %errorlevel% neq 0 (
    echo [%date% %time%] ERROR: git pull 失敗 - %RESULT% >> "%LOG_FILE%"
    exit /b 1
)

echo %RESULT% | findstr /c:"Already up to date" >nul
if %errorlevel% equ 0 (
    exit /b 0
)

echo [%date% %time%] UPDATE: %RESULT% >> "%LOG_FILE%"
exit /b 0
