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
2. Web の 設定 > モデル > OpenCode Zen (Live) の「編集」を開き、マスク済み API キー入力欄にキーを貼り付けて保存
3. モデルセレクターから OpenCode のモデルを選んで使う

| コマンド | 効果 |
|---|---|
| `/dsh-opencode` | ステータス表示とキー設定場所の案内 |
| `/opencode-refresh [all\|zen\|go]` | カタログを強制更新 |
| `/opencode-status` | 更新時刻・エラー・モデル数・キー設定状況 |
| `/opencode-models <zen\|go> [--all]` | モデル一覧(`--all` で非対応含む) |

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

- API キーは設定 UI から保存(コマンド引数では受け付けない)。環境変数 `OPENCODE_API_KEY` でも可
- `cachePath` でキャッシュ位置を変更可能(既定は DSH ホーム下 `cache/opencode-live/catalog.json`)

## 開発

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
```
