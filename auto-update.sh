#!/bin/bash
# auto-update.sh
# Sheets Tab Manager Chrome拡張機能の自動更新スクリプト（Mac/Linux用）
# リポジトリを定期的に git pull して最新に保つ
# auto-reload.ts がバージョン変更を検知 → Chrome拡張を自動リロード

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ローカル変更チェック（未コミットの変更があればスキップ）
if ! git -C "$SCRIPT_DIR" status --porcelain | grep -q '^'; then
    RESULT=$(git -C "$SCRIPT_DIR" pull --ff-only 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ]; then
        log "ERROR: git pull 失敗 - $RESULT"
    elif echo "$RESULT" | grep -q "Already up to date"; then
        exit 0
    else
        log "UPDATE: $RESULT"
    fi
else
    log "SKIP: ローカルに未コミットの変更があるためスキップ"
fi
