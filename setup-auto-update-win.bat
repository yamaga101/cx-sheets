@echo off
REM setup-auto-update-win.bat
REM Sheets Tab Manager Chrome拡張機能の自動更新セットアップスクリプト（Windows用）
REM タスクスケジューラに2分間隔の自動更新タスクを登録する

setlocal
set "EXTENSION_DIR=%~dp0"
set "TASK_NAME=CxSheetsAutoUpdate"
set "BAT_PATH=%EXTENSION_DIR%auto-update.bat"

echo === Sheets Tab Manager 自動更新セットアップ（Windows） ===
echo 拡張機能ディレクトリ: %EXTENSION_DIR%
echo.

echo [1/3] 既存タスクを削除（初回は無視）...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
echo       完了

echo [2/3] タスクスケジューラに登録（2分間隔）...
schtasks /create /tn "%TASK_NAME%" /tr "\"%BAT_PATH%\"" /sc minute /mo 2 /f
if %errorlevel% neq 0 (
    echo       エラー: タスクの登録に失敗しました
    echo       管理者権限で実行してください
    pause
    exit /b 1
)
echo       完了

echo [3/3] タスクを即時実行して動作確認...
schtasks /run /tn "%TASK_NAME%" >nul 2>&1
echo       完了

echo.
echo === セットアップ完了 ===
echo 2分ごとに自動更新が実行されます。
echo auto-reload.ts がバージョン変更を検知すると Chrome拡張が自動リロードされます。
echo.
echo ログファイル: %EXTENSION_DIR%auto-update.log
echo 停止: schtasks /delete /tn %TASK_NAME% /f
echo 確認: schtasks /query /tn %TASK_NAME%
echo.
pause
