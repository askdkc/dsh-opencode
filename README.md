# dsh-opencode

OpenCode Zen / Go を動的カタログ付きのライブ LLM ルートとして DSH に追加するプラグイン。

- `opencode-zen-live` — OpenCode Zen (Live)
- `opencode-go-live` — OpenCode Go (Live)

## インストール

```sh
pnpm dsh plugin --profile web add github:askdkc/dsh-opencode
```

削除:

```sh
pnpm dsh plugin --profile web remove dsh-opencode
```

## 使い方

1. DSH を再起動すると両ルートが登録される(以降のカタログ更新に再起動は不要)
2. `/dsh-opencode` を引数なしで実行し、Client のポップアップから Zen または Go を選ぶ
3. Settings > Models の各 Live 行、またはセットアップ画面で API キーを保存する
4. モデルセレクターから OpenCode のモデルを選んで使う

| コマンド | 効果 |
|---|---|
| `/dsh-opencode [status\|help]` | API キーを含めずに各 route の状態を表示 |
| `/opencode-refresh [all\|zen\|go]` | カタログを強制更新 |
| `/opencode-status` | 更新時刻・エラー・モデル数・キー設定状況 |
| `/opencode-models <zen\|go> [--all]` | モデル一覧(`--all` で非対応含む) |

- API キーはコマンド引数では受け取らず、Client の password 欄から DSH Credentials API にだけ保存
- 既定では Zen / Go が `OPENCODE_API_KEY` を共有するため、1 回の保存が両 route に反映
- カスタム credential reference は選択した route だけに保存。読み取り専用・確認不能は入力を無効化
- 環境変数 `OPENCODE_API_KEY`(両ルート既定参照)でも可

Client bundle は `pnpm build` で Host と一緒に生成される。Client command decoration、provider-card、shell overlay、Credentials Remote を持つ DSH 構成を対象とし、実ブラウザーでの互換性確認が必要です。

## 設定

名前空間 `opencode-live`(デフォルトは `cordis.patch.yml` 参照):

```yaml
providers:
  opencode-zen-live:
    product: zen
    apiKeyEnv: OPENCODE_API_KEY   # 両ルート既定は同一参照
  opencode-go-live:
    product: go
    apiKeyEnv: OPENCODE_API_KEY
catalog:
  refreshIntervalMs: 900000
  timeoutMs: 15000
  requireFresh: false
```

- `cachePath` でキャッシュ位置を変更可能(既定は DSH ホーム下 `cache/opencode-live/catalog.json`)

## 開発

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
```
