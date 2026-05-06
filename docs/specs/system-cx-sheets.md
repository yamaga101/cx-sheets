---
visibility: internal
---
# cx-sheets — Sheets Tab Manager（Chrome 拡張）

## これは何？

Google Sheets のタブ（シート）を **サイドパネルから一括操作** できる Chrome 拡張機能。
名前変更（rename）・並べ替え（reorder）・色設定（color）・追加（add）・削除（delete）・
複製（duplicate）を、スプレッドシート上部の小さなタブ UI ではなく、サイドパネルの広い領域で
快適に行うことを目的とする。

v1.5.0、Manifest V3、TypeScript + Vite、Chrome 114+。

## なぜあるの？

- Google Sheets の標準タブ UI は、タブ数が多い（20〜100）スプシで操作性が著しく低下
- 業務スプシ（DX推進管理統合版・お助けマンDay 等）は半期で 50+ タブに膨張する
- 並べ替え・色付けは標準 UI ではドラッグの精度が低くストレスになる
- DX 案件で多用される「タブを年月単位で整理」「色で分類」を高速化
- 自分用ツールだが、社内の DX 推進室・経営企画でも需要があるため Chrome 拡張で配布可能な形にする

## どう動いてるの？

```
Chrome 拡張 (Manifest V3)
        │
        ├─ background/service-worker.ts  OAuth・Sheets API 呼出
        ├─ content/screen-reader-guard.ts  Sheets ページ内コンテキスト
        ├─ sidepanel/index.html  サイドパネル UI（React or vanilla）
        │
        ▼
Chrome Identity API
        │
        ▼
Google OAuth (client_id: 403660380335-9jphht0mhtuah874io5g3u1lps0lmp4m)
        │
        ▼
scope: https://www.googleapis.com/auth/spreadsheets
        │
        ▼
[ Sheets API v4 ]
- batchUpdate (rename / reorder / color / delete)
- spreadsheets.values append (add)
- spreadsheets.sheets.copyTo (duplicate)
```

- **Trigger**: `docs.google.com/spreadsheets/*` を開いている時に拡張アイコン or サイドパネルをクリック
- **Permissions**: identity / sidePanel / storage / activeTab / tabs / alarms / nativeMessaging
- **Host permissions**: `https://docs.google.com/spreadsheets/*`

## 壊れたらどうする？

| 症状 | 対応 |
|------|------|
| OAuth が通らない | manifest の client_id が k35 GCP プロジェクトに登録されているか確認。`chrome://identity-internals/` でトークン状態確認 |
| サイドパネル開かない | Chrome 114+ か確認。`chrome://extensions` で拡張を re-enable |
| 操作が反映されない | sheets.googleapis.com の API quota を確認。バッチ更新サイズが大きすぎないか |
| タブ並び順が崩れる | `batchUpdate` の reorder API は index ベース。並び替えロジックは `src/sidepanel/` 内 |
| 自動更新が止まる | `auto-update.{sh,bat,ps1,plist}` で Mac/Win 両対応。ローカル launchd / Task Scheduler を確認 |

**Rollback**: Chrome 拡張は version downgrade 不可。問題があれば Sheets 側の「変更履歴」で復元。

## 止めたらどうなる？

- **即時影響**: 多タブスプシの操作性が標準 UI に戻る → 操作時間 2-3 倍
- **中期影響**: スプシ整理を諦め、新規スプシを作りがちに（情報分散リスク）
- **退職時影響**: 拡張に依存していた本人のみ影響。後任が同じ拡張を入れれば復元可（ただし OAuth は再設定要）

## 必要なアカウント・権限

| Resource | Location |
|----------|----------|
| Chrome 拡張 | ローカルインストール（unpacked）or 自動更新 |
| OAuth client | k35 GCP プロジェクトの拡張用 client_id（manifest に直書き） |
| Sheets scope | `https://www.googleapis.com/auth/spreadsheets` |
| 拡張秘密鍵 | `extension.pem`（git管理外、`~/.chrome-ext-keys/` chmod 600 推奨） |

## 関連する人・部署

| 関係者 | 関与 |
|--------|------|
| DX推進統括（志柿） | owner / 主利用者 |
| DX 推進室メンバー（配布時） | 副利用者 |

## 技術メモ（わかる人向け）

- **Stack**: TypeScript + Vite + @crxjs/vite-plugin v2.0
- **Build**: `pnpm build`（`tsc --noEmit` + Vite build）/ `pnpm dev` で watch
- **Files**:
  - `src/background/service-worker.ts` — Service Worker（OAuth・API 呼出）
  - `src/content/screen-reader-guard.ts` — Content Script（Sheets ページ内ガード）
  - `src/sidepanel/index.html` — サイドパネル UI
  - `src/lib/` — 共通ライブラリ
- **manifest.src.json → manifest.json**: ビルド時に変換（`vite.config.ts`）
- **自動更新**: `auto-update.{sh,bat,ps1,plist}` で OS 別に対応。Mac は launchd、Win は Task Scheduler
- **upload_to_drive.py**: 内部配布用に dist/ を Drive にアップ
- **拡張秘密鍵 `extension.pem`**: 拡張 ID 固定のため必須。git 管理外。紛失すると拡張 ID が変わりユーザの再インストール必要
- **次の改善候補**: タブ検索・グループ化（`tabs` permission を活用）、複数スプシの cross-tab 操作
