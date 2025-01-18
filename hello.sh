#!/usr/bin/env bash

API_KEY="$(cat .secrets/gemini-api-key.txt)"
MODEL_CODE="models/gemini-1.5-pro-001"
SYSTEM_INSTRUCTION="$(cat system_instruction.md)"
USER_INPUT="$1"

json_payload=$(jq -n --arg system_instruction "$SYSTEM_INSTRUCTION" --arg user_input "$USER_INPUT" '{
  system_instruction: {
    parts: [{"text": $system_instruction}]
  },
  contents: [{
    parts: [{"text": $user_input}]
  }]
}')

response=$(curl -s -H 'Content-Type: application/json' \
-X POST \
-d "$json_payload" \
"https://generativelanguage.googleapis.com/v1beta/${MODEL_CODE}:generateContent?key=$API_KEY")

generated_text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text')

echo "$generated_text"
