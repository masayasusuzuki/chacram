# OpenClaude DeepSeek カスタマイズ記録

## このディレクトリは何か

GitHub の [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) をクローンしたソースコード。
グローバルインストール版（npm）は削除済み。これが唯一の OpenClaude 実行基盤。

## 起動方法

```bash
cd /Users/suzukimotoyasumain/Desktop/MASAYASU/experiments/openclaude
bash run-deepseek.sh
```

ソース編集後は `npm run build` してから再起動。

## run-deepseek.sh のカスタマイズ

| 環境変数 | 値 | 目的 |
|---------|---|------|
| `CLAUDE_CODE_USE_OPENAI` | `1` | OpenAI互換モードでDeepSeekに向ける |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek APIエンドポイント |
| `OPENAI_API_KEY` | `.env`の`DEEPSEEK_API_KEY` | DeepSeek認証 |
| `CLAUDE_CODE_HAIKU_MODEL` | `deepseek-v4-flash` | haikuエイリアスの代替モデル（1/3のコスト） |
| `CLAUDE_CODE_AUTO_MODE` | `1` | Shift+Tab自動許可を有効化 |
| `ANTHROPIC_API_KEY` | （unsetしない） | visionProxyで画像解析に必要 |

## ソースコード改修一覧

### 1. マルチモーダル対応（画像/PDF） — visionProxy

**ファイル:** `src/services/api/visionProxy.ts`（新規）、`src/services/api/claude.ts`（修正）

**仕組み:**
1. DeepSeek に画像/PDFが含まれるメッセージを送る直前で捕捉
2. 画像ブロックを Anthropic Sonnet API に転送してテキスト説明に変換
3. DeepSeek にはテキストだけ届く

**修正内容:**
- OpenAI互換フォーマット（`image_url`）に対応（元はAnthropic形式の`image`のみ）
- `image_url` の data URL を Anthropic の image フォーマットに変換

### 2. WebSearch → Brave Search ネイティブ統合

**ファイル:** `src/tools/WebSearchTool/providers/brave.ts`（新規）、`providers/index.ts`（修正）

**修正内容:** Brave Search をビルトイン WebSearch のプロバイダーとして追加。`.env` の `BRAVE_SEARCH_API_KEY` が自動で使われる。

### 3. サブエージェントのモデル振り分け（オーケストレーター）

**ファイル:** `src/utils/model/agent.ts`（修正）

**仕組み:**
- 非Claudeプロバイダで `haiku` が指定されると、`CLAUDE_CODE_HAIKU_MODEL` 環境変数のモデルにマッピング
- DeepSeek では `haiku` → `deepseek-v4-flash`（コスト1/3）
- 影響するエージェント: Explore, claude-code-guide
- Plan, verification, code-reviewer は v4-pro のまま

**コスト比較:**

| モデル | 入力 $/1M | 出力 $/1M |
|--------|----------|----------|
| v4-pro | $0.435 | $0.87 |
| v4-flash | $0.14 | $0.28 |

### 4. Auto Mode 有効化

**ファイル:** `src/utils/betas.ts`（修正）

**修正内容:** `modelSupportsAutoMode()` に `CLAUDE_CODE_AUTO_MODE=1` の環境変数チェックを追加。非firstPartyプロバイダでも明示的に有効化できるようにした。

### 5. ステータスライン（モデル表示）

**ファイル:** `~/.claude/settings.json`（修正）

**設定:**
```json
"statusLine": {
  "type": "command",
  "command": "input=$(cat); model=$(echo "$input" | jq -r '.model.display_name // .model.id' | sed 's/deepseek-//'); dir=$(echo "$input" | jq -r '.workspace.current_dir' | sed "s|$HOME|~|"); echo \"${model}  ${dir}\""
}
```

ターミナル下部に `v4-pro  ~/path/to/dir` のように現在のモデルを表示。

### 6. `.gitignore` 修正

`tools/` → `/tools/` に変更（`src/tools/` が除外されるのを防止）

## アップデート手順

```bash
cd experiments/openclaude
git fetch origin
git merge origin/main
# コンフリクトがあれば解消
npm run build
```

大半の修正は新規ファイルなのでコンフリクトの可能性は低い。
