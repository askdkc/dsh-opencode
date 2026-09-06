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
2. `/dsh-opencode` を実行して API キーを設定する
   - キー未設定ならコマンドの入力フィールドにキーを貼って再度実行
   - DSH の opencode キー保存先(`OPENCODE_API_KEY`)に書き込み、設定や他の参照を変えていないか検証
3. モデルセレクターから OpenCode のモデルを選んで使う

| コマンド | 効果 |
|---|---|
| `/dsh-opencode [<api-key>]` | API キーを保存して Zen/Go を有効化(未入力なら状態表示) |
| `/opencode-refresh [all\|zen\|go]` | カタログを強制更新 |
| `/opencode-status` | 更新時刻・エラー・モデル数・キー設定状況 |
| `/opencode-models <zen\|go> [--all]` | モデル一覧(`--all` で非対応含む) |

- API キーはコマンドの入力フィールドで受け取り、`recordInput: false` でログに残さない
- 保存後、設定セクションと他の認証参照が変わっていないことを検証してから成功を報告する
- 環境変数 `OPENCODE_API_KEY`(両ルート既定参照)でも可

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
