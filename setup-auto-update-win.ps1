# setup-auto-update-win.ps1
# Sheets Tab Manager 自動更新セットアップ（Windows / 管理者権限不要）
# ユーザータスクとしてタスクスケジューラに登録

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TASK_NAME = "CxSheetsAutoUpdate"
if ($PSScriptRoot) { $SCRIPT_DIR = $PSScriptRoot }
elseif ($MyInvocation.MyCommand.Path) { $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path }
else { $SCRIPT_DIR = $PWD.Path }

$UPDATE_BAT = Join-Path $SCRIPT_DIR "auto-update.bat"

try {

Write-Host "=== Sheets Tab Manager 自動更新セットアップ ===" -ForegroundColor Cyan
Write-Host "拡張機能ディレクトリ: $SCRIPT_DIR" -ForegroundColor Gray
Write-Host ""

# --- Step 1: Check git ---
Write-Host "[1/3] Git を確認中..." -ForegroundColor Cyan
try {
    $gitVer = & git --version 2>&1
    Write-Host "  $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Git が見つかりません。インストールしてください。" -ForegroundColor Red
    Read-Host "Enterで終了"
    exit 1
}

if (-not (Test-Path $UPDATE_BAT)) {
    Write-Host "  ERROR: auto-update.bat が見つかりません" -ForegroundColor Red
    Read-Host "Enterで終了"
    exit 1
}

# --- Step 2: Register Task Scheduler (no admin required) ---
Write-Host ""
Write-Host "[2/3] タスクスケジューラに登録中..." -ForegroundColor Cyan

try {
    # Remove existing task
    $existingTask = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "  既存タスク「$TASK_NAME」を更新します" -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
    }

    # Create action: run auto-update.bat
    $actionParams = @{
        Execute = "cmd.exe"
        Argument = "/c ""$UPDATE_BAT"""
        WorkingDirectory = $SCRIPT_DIR
    }
    $action = New-ScheduledTaskAction @actionParams

    # Trigger: at logon
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    # Settings: battery OK, start when available, 5min timeout
    $settingsParams = @{
        AllowStartIfOnBatteries = $true
        DontStopIfGoingOnBatteries = $true
        StartWhenAvailable = $true
        ExecutionTimeLimit = New-TimeSpan -Minutes 2
        MultipleInstances = "IgnoreNew"
    }
    $settings = New-ScheduledTaskSettingsSet @settingsParams

    # Register as current user task (no admin required)
    $regParams = @{
        TaskName = $TASK_NAME
        Action = $action
        Trigger = $trigger
        Settings = $settings
        Description = "Sheets Tab Manager を2分間隔で git pull して最新に保つ"
    }
    Register-ScheduledTask @regParams | Out-Null

    # Add 2-min repetition via schtasks (compatible with all PS versions)
    & schtasks /Change /TN $TASK_NAME /RI 2 /DU 24:00 2>$null | Out-Null

    Write-Host "  タスク「$TASK_NAME」を登録しました（2分間隔）" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: タスクスケジューラ登録に失敗: $_" -ForegroundColor Yellow
    Write-Host "  手動実行: auto-update.bat をダブルクリック" -ForegroundColor Yellow
}

# --- Step 3: Test run ---
Write-Host ""
Write-Host "[3/3] テスト実行中..." -ForegroundColor Cyan
try {
    & cmd /c "$UPDATE_BAT"
    Write-Host "  テスト実行完了" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: テスト実行に失敗: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== セットアップ完了 ===" -ForegroundColor Green
Write-Host ""
Write-Host "設定内容:" -ForegroundColor Cyan
Write-Host "  - 2分ごとに git pull（変更なければスキップ）"
Write-Host "  - ログオン時にも実行"
Write-Host "  - Chrome 側 auto-reload.ts が1分ごとにバージョン検知 → 自動リロード"
Write-Host ""
Write-Host "管理:" -ForegroundColor Cyan
Write-Host "  確認: schtasks /query /tn $TASK_NAME"
Write-Host "  停止: schtasks /delete /tn $TASK_NAME /f"
Write-Host "  ログ: $SCRIPT_DIR\auto-update.log"

} catch {
    Write-Host ""
    Write-Host "エラーが発生しました: $_" -ForegroundColor Red
}

Write-Host ""
Read-Host "Enterキーで終了"
