#!/usr/bin/env bash

API_KEY="$(cat .secrets/gemini-api-key.txt)"
MODEL_CODE="models/gemini-1.5-pro-001"
SYSTEM_INSTRUCTION="$(cat system_instruction.md)"
HISTORY_FILE="${2:-history.txt}" # 引数で指定したファイル名、デフォルトはhistory.txt

# エラー処理用の関数
function handle_error {
  echo "エラーが発生しました: $1" >&2
  echo "レスポンス: $response" >&2
  exit 1
}

# 会話履歴の読み込み
if [[ -f "$HISTORY_FILE" ]]; then
  HISTORY=$(cat "$HISTORY_FILE")
else
  HISTORY=""
fi

USER_INPUT="$1"

# 会話履歴をJSONに埋め込み
json_payload=$(jq -n --arg system_instruction "$SYSTEM_INSTRUCTION" --arg history "$HISTORY" --arg user_input "$USER_INPUT" '{
  system_instruction: {
    parts: [{"text": $system_instruction}]
  },
  contents: [
    {
      role: "user",
      parts: [{"text": $history}]
    },
    {
      role: "user",
      parts: [{"text": $user_input}]
    }
  ]
}')

response=$(curl -s -H 'Content-Type: application/json' \
-X POST \
-d "$json_payload" \
"https://generativelanguage.googleapis.com/v1beta/${MODEL_CODE}:generateContent?key=$API_KEY")

# エラー処理
if [[ $(echo "$response" | jq -e '.error' > /dev/null; echo $?) == "0" ]]; then
  handle_error "APIリクエストエラー"
fi

generated_text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text')

# レスポンス全体を標準出力
echo "$response"

# 会話履歴の保存
echo "User: $USER_INPUT" >> "$HISTORY_FILE"
echo "Taro: $generated_text" >> "$HISTORY_FILE"

# レスポンスのテキスト部分のみ出力
echo "$generated_text"
