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
2. Settings > Models の OpenCode Zen (Live) または OpenCode Go (Live) 行にある **OpenCode API key** 欄にキーを貼り付け、**Save API key** を押す
3. モデルセレクターから OpenCode のモデルを選んで使う

`/dsh-opencode` によるセットアップは不要。既存のインストールでは、この修正を含むプラグインに更新して DSH を再起動し、ブラウザーも再読み込みしてください。

案内ポップアップとAPIキー設定画面は、DSHで選択した言語を優先し、未選択ならブラウザーの優先言語で日本語・英語を自動切り替えします。日本語以外は英語表示です。開いている画面の文言も設定変更に追従します。チャット履歴に残るコマンド結果と送信時のエラーは、DSHの言語設定、未選択ならサーバーの言語環境（`LC_ALL` / `LC_MESSAGES` / `LANG`）に従います。

| コマンド | 効果 |
|---|---|
| `/dsh-opencode [status\|help]` | 設定場所と手順をポップアップで案内（Web以外ではテキスト表示） |
| `/opencode-refresh [all\|zen\|go]` | カタログを強制更新 |
| `/opencode-status` | 更新時刻・エラー・モデル数・キー設定状況 |
| `/opencode-models <zen\|go> [--all]` | モデル一覧(`--all` で非対応含む) |

- API キーはコマンド引数では受け取らず、Client の password 欄から DSH Credentials API にだけ保存
- 既定では Zen / Go が `OPENCODE_API_KEY` を共有するため、1 回の保存が両 route に反映
- カスタム credential reference は選択した route だけに保存。読み取り専用・確認不能は入力を無効化
- 保存済みキーは **Delete API key** で削除。共有キーの場合は Zen / Go の両方が未設定になる。**Clear input** は入力欄だけを空にする
- 環境変数 `OPENCODE_API_KEY`(両ルート既定参照)でも可

Client bundle は `pnpm build` で Host と一緒に生成される。Settings の provider-card 拡張と Credentials Remote を使用し、セッションやコマンド UI がなくてもキーを設定できます。

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
