#!/usr/bin/env bash
# openclaude を DeepSeek（OpenAI互換API）に向けて起動するラッパー
# .env を読み込んで OPENAI_* に転写し、openclaude を対話モードで起動する

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "Error: $SCRIPT_DIR/.env not found" >&2
  exit 1
fi

set -a
source "$SCRIPT_DIR/.env"
set +a

if [ -z "$DEEPSEEK_API_KEY" ]; then
  echo "Error: DEEPSEEK_API_KEY is empty in .env" >&2
  exit 1
fi

export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="$DEEPSEEK_API_KEY"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export OPENAI_MODEL="${DEEPSEEK_MODEL:-deepseek-v4-pro}"

# サブエージェントのモデル割り当て
# haiku → v4-flash（Explore, claude-code-guide など軽い調査）
# sonnet → 未設定（Plan, verification などは親の v4-pro を継承）
export CLAUDE_CODE_HAIKU_MODEL="deepseek-v4-flash"

# Auto mode (Shift+Tab で自動許可) を有効化
export CLAUDE_CODE_AUTO_MODE=1

# openclaude が他プロバイダの認証 env を拾って経路を切り替えると即終了する。
# vision.sh / web-search.sh は自前で .env を source するので、ここで unset しても問題ない。
# 新しいプロバイダを .env に足すたびにこのリストに追加すること。
# ANTHROPIC_API_KEY は visionProxy.ts で画像/PDF解析に使うので unset しない
unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN \
      CLAUDE_API_KEY CLAUDE_CODE_OAUTH_TOKEN \
      GEMINI_API_KEY GOOGLE_API_KEY \
      GROQ_API_KEY \
      MISTRAL_API_KEY \
      COHERE_API_KEY

# --- Splash screen (Enterキーで openclaude 起動) ---
ORANGE='\033[38;5;208m'
ACCENT='\033[38;5;215m'
DIM='\033[38;5;243m'
RESET='\033[0m'
clear
printf "${ORANGE}"
cat <<'LOGO'

  ████████╗ ████████╗ ████████╗ ██╗  ██╗
  ██╔═══██║ ██╔═══██║ ██╔═════╝ ███╗ ██║
  ██║   ██║ ████████║ ██████╗   ████╗██║
  ██║   ██║ ██╔═════╝ ██╔═══╝   ██╔████║
  ████████║ ██║       ████████╗ ██║ ╚███║
  ╚═══════╝ ╚═╝       ╚═══════╝ ╚═╝  ╚══╝

  ████████╗ ██╗      ████████╗ ██╗   ██╗ ███████╗  ████████╗
  ██╔═════╝ ██║      ██╔═══██║ ██║   ██║ ██╔═══██╗ ██╔═════╝
  ██║       ██║      ████████║ ██║   ██║ ██║   ██║ ██████╗
  ██║       ██║      ██╔═══██║ ██║   ██║ ██║   ██║ ██╔═══╝
  ████████╗ ████████╗██║   ██║ ╚██████╔╝ ███████╔╝ ████████╗
  ╚═══════╝ ╚═══════╝╚═╝   ╚═╝  ╚═════╝  ╚══════╝  ╚═══════╝

LOGO
printf "  ${ACCENT}✦${RESET} Any model. Every tool. Zero limits. ${ACCENT}✦${RESET}\n"
printf "  ${ACCENT}✦${RESET} ${ORANGE}DeepSeek ${OPENAI_MODEL} ready${RESET} ${ACCENT}✦${RESET}\n\n"
printf "  ${DIM}Press any key to start...${RESET}"
read -n 1 -s -r
echo
clear

# --- DeepSeek 用システムプロンプト ---
# (1) 画像/PDF は visionProxy が Anthropic Sonnet でテキスト化するので Read してOK
# (2) 音声/動画 は読まない（テキスト化できない）
# (3) 検索は組み込み web_search ではなく Brave Search ヘルパー経由
WEB_SEARCH_TOOL="$SCRIPT_DIR/tools/web-search.sh"

DEEPSEEK_SYSTEM_PROMPT="You are running on the DeepSeek API. The DeepSeek chat completion API does NOT support image/vision/audio/PDF inputs, and the built-in WebSearch tool does NOT work on this provider (it is Anthropic-only).

CRITICAL RULES:

[Tone & Voice — 日本語で応答する場合の口調]
- Always respond in Japanese unless the user writes in another language.
- フレンドリーで親しみやすいトーン。タメ口OK、敬語の強要なし。
- ユーザーの呼び方: 「まさやすさん」または主語省略。
- 禁止する人称: 「お前」「貴様」「貴方」「お主」「君」(見下し感がある呼び方は全部NG)。
- 自分の一人称は自然な範囲で。「俺」「自分」「DeepSeek」あたりはOK。「儂」「拙者」などの古風表現は避ける。
- 過度に堅いビジネス敬語(「〜でございます」「〜致します」)は使わない。普通の砕けた日本語で。
- 結論を先に出す。無駄な前置きや過剰な復唱はしない。
- 提案する時は「〜してみる?」「〜どう?」のように相談ベース。一方的な命令調は避ける。
- 絵文字や過剰な装飾は控えめに。プレーンで自然な砕けたトーンが理想。

[Non-text inputs]
1. Images (.png, .jpg, etc.) and PDFs: You CAN use the Read tool. They will be automatically converted to text descriptions via Anthropic Sonnet before reaching DeepSeek.
2. Do NOT use the Read tool on audio (.mp3, .wav, .m4a, etc.) or video (.mp4, .mov, etc.) — these cannot be proxied.
3. To verify a non-text file exists without reading it, use Bash with ls / file / identify / stat.
4. If you accidentally read an audio/video file and the API errors out, the session history is corrupted — the user must /exit and restart.

[Web search]
5. Do NOT call the built-in WebSearch tool — it routes to Anthropic and will fail with auth errors.
6. To search the web, invoke the Brave Search helper via Bash:
     $WEB_SEARCH_TOOL \"your search query\"
   Optional second arg: result count (default 5, max 20).
7. The helper returns markdown-formatted results: title, URL, description per hit. Cite the URLs in your response.
8. WebFetch tool (for fetching a single known URL) works fine — use it when you have a specific URL.

This rule set overrides any default tool-use heuristics."

exec node "$SCRIPT_DIR/dist/cli.mjs" --append-system-prompt "$DEEPSEEK_SYSTEM_PROMPT" "$@"
