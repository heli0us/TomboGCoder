# TomboGCoder

株式会社システムアイ製「NC Viewer」をベンチマークとした、**FANUC 3軸マシニングセンタ向けデスクトップ NCビューア＆事前検証アプリ**（macOS / Windows 両対応）。

## 主な機能（Phase 1 + Phase 2 実装済み）
- **VS Code風ダークUI**：アクティビティバー／サイドバー／CodeMirror 6 エディタ／Three.js 3Dビューポート／ボトムパネル／ステータスバー
- **FANUC 3軸 NC解析 & カスタムマクロB / サブプログラム（Rustコア）**：`G00`〜`G03`（I/J/K・R指定・全円・ヘリカル）、`G17`〜`G19`、`G90`/`G91`、`G54`〜`G59`、`G28`/`G30`、`G43`/`G49`、`G73`/`G74`/`G76`/`G80`〜`G89` 固定サイクル、`M98`/`M99` サブプログラム（同一ファイル・外部ファイル参照）、`G65` マクロ呼出・変数 `#1`〜`#999`・算術/三角関数・`IF`/`GOTO`/`WHILE`/`DO`/`END`、Shift-JIS / UTF-8 自動判別読込
- **工具径補正（G40/G41/G42）**：D番号ごとの工具直径リアルタイム編集、コメント自動抽出、スタートアップ／内角交点／外角ロールアラウンド円弧／キャンセル演算、過切込・内R不足エラー検出、補正前・補正後パスの重ね比較表示、**工具径塗りつぶし描画（削り残し確認）**
- **トレース & デバッグ検証**：1ブロック送り・戻し、速度可変自動トレース、シークバー、エディタ行⇔3Dパスの双方向ハイライト、3Dエンドミルモデル表示、マウスホバーツールチップ、**ガター行ブレイクポイント＆条件自動停止（工具交換・Z突入・径補正切替・エラー行）**
- **高度なビュー & 計測**：**4面図同時表示（XY/XZ/YZ/ISO）**、**端点・中点・円弧中心スナップによる2点間距離計測**、**Z高さスライス表示**
- **サイクルタイム & レポート出力 & 外部連動**：早送り速度・ATC時間・加減速係数に基づく全体＆工具別サマリー、**CSV / 印刷対応HTMLレポート出力**、**外部エディタ保存時の自動監視リロード**

## 開発・起動方法

### 必要環境
- Node.js 20+
- Rust (stable) / Cargo
- macOS: Xcode Command Line Tools / Windows: Microsoft Visual Studio C++ Build Tools & WebView2

### デスクトップアプリ開発起動（Mac / Windows 共通）
```bash
npm install
npm run tauri dev
```

### プロダクションビルド（`.app`/`.dmg` または `.msi`/`.exe`）
```bash
npm run tauri build
```

### GitHub Actions での Windows `.exe` / macOS `.dmg` 自動ビルド
GitHub リポジトリへ push 後、GitHub 画面の **Actions → Build Desktop App (Windows & macOS) → Run workflow** を実行すると、Windows 実機なしで以下が自動ビルドされ Artifacts からダウンロードできます。
- `TomboGCoder_*_x64-setup.exe`（Windows NSIS インストーラー）
- `TomboGCoder_*_x64_en-US.msi`（Windows MSI インストーラー）
- `TomboGCoder-portable.exe`（インストール不要の単体実行 `.exe`）
- `TomboGCoder_*_aarch64.dmg`（macOS Apple Silicon インストーラー）

バージョンタグ（例：`git tag v0.1.0 && git push origin v0.1.0`）を push すると、GitHub Releases にもドラフトとして自動添付されます。

### テスト・型チェック
```bash
npm run build
cd src-tauri && cargo test
```
