# Bootstrap Agent

## Purpose

- コーディングのタスクを自動化したい
- 目的、用途によって、拡張・カスタマイズできるようにしたいが、その作業自体も自動化したい
- CLIから使えるエージェントがほしい

## Rules

- 自分ではコードを書かない
  - 書くのは最初にLLMとやりとりするスクリプトとプロンプトのみ
  - プロンプトの練習も兼ねている
  - LLM自身に書かせることで、拡張・カスタマイズをLLM自身にやってもらう際のヒントを得る

# Log

## (0) Hello, World!

まずは一問一答の形式でやり取りするスクリプトを準備。ここだけは私が書く。

commit: fcb291df1f9aa5c9fe444482a20558dd79b29f7c

```sh
bash agent.sh "Hello, World!"
```

Output:
```
Hello, World! It's nice to meet you. What can I help you solve today? 😊 
```

Gemini APIの仕様を確認する過程でsystem instructionをファイルから読めるようにしたが、ここではなくても良かった。

## (1) Conversation History

会話の内容を保持できるようにする。

commit: cdf08a4e129314ad3addd18f219c6749f22e9401

```sh
# まだAgentと呼べるほどのものではないのでリネーム
mv agent.sh hello.sh

bash hello.sh "$(cat <<EOF
あなたと一問一答の形式でやりとりするスクリプトを書きました。
会話の内容を保持して会話を続けられるようにしたいです。

引数で指定したファイルに会話の履歴を保持するようにBashスクリプトを拡張してもらえますか？
履歴にはあなたの出力なのかUserのInputなのかがわかるフォーマットで保存してください。
また、エラーが発生した場合に原因が分かるように、レスポンス全体も標準出力に出すようにしてください。

利用しているAPIの仕様は以下の通りです。
{
  "cachedContent": string,
  "contents": [
    {
      "role": string,
      "parts": [
        {
          // Union field data can be only one of the following:
          "text": string,
          "inlineData": {
            "mimeType": string,
            "data": string
          },
          "fileData": {
            "mimeType": string,
            "fileUri": string
          },
          // End of list of possible types for union field data.

          "videoMetadata": {
            "startOffset": {
              "seconds": integer,
              "nanos": integer
            },
            "endOffset": {
              "seconds": integer,
              "nanos": integer
            }
          }
        }
      ]
    }
  ],
  "systemInstruction": {
    "role": string,
    "parts": [
      {
        "text": string
      }
    ]
  },
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": string,
          "description": string,
          "parameters": {
            object (OpenAPI Object Schema)
          }
        }
      ]
    }
  ],
  "safetySettings": [
    {
      "category": enum (HarmCategory),
      "threshold": enum (HarmBlockThreshold)
    }
  ],
  "generationConfig": {
    "temperature": number,
    "topP": number,
    "topK": number,
    "candidateCount": integer,
    "maxOutputTokens": integer,
    "presencePenalty": float,
    "frequencyPenalty": float,
    "stopSequences": [
      string
    ],
    "responseMimeType": string,
    "responseSchema": schema,
    "seed": integer,
    "responseLogprobs": boolean,
    "logprobs": integer,
    "audioTimestamp": boolean
  },
  "labels": {
    string: string
  }
}

以下がスクリプトです。
$(cat hello.sh)
EOF
)"
```

- Bashスクリプトと明記しないとPythonのスクリプトを書いてしまったため、明記した。
- Gemini APIの仕様を渡さないと無効なフォーマットでリクエストを送ってしまうため、仕様を明記。

<details>
<summary>Output:</summary>

<pre><code>
```bash
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
```

**変更点:**

1. **エラー処理:** `curl` と API レスポンスのエラー処理を追加しました。エラー発生時には、エラーメッセージとレスポンス全体を標準エラー出力に出力します。
2. **会話履歴のファイル保存:** 引数で指定したファイル名(デフォルトは `history.txt`)に、User と Taro のやりとりを追記するようにしました。
3. **会話履歴の読み込み:** スクリプト実行時に `history.txt` が存在する場合は、その内容を読み込んで会話履歴として利用します。
4. **レスポンス全体を標準出力:** デバッグのために API からのレスポンス全体を標準出力するようにしました。

**使い方:**

1. `.secrets/gemini-api-key.txt` に API キーを保存します。
2. `system_instruction.md` にシステム命令を記述します。
3. スクリプトに実行権限を与えます: `chmod +x script.sh`
4. スクリプトを実行します: `./script.sh "質問"`
   - 例: `./script.sh "今日の天気は？"`
   - 会話履歴のファイル名を指定する場合: `./script.sh "今日の天気は？" conversation.log`

これで、会話内容が指定されたファイルに保存され、次回実行時に引き継がれます。
</pre></code>

</details>

```sh
bash chat.sh "こんにちは。私の名前はShumpeiです。" history-20250118-1830.txt
```

Output:
```
こんにちは、Shumpeiさん。

お会いできて嬉しいです。何か私にできることはありますか？ 😊
```

```sh
bash chat.sh "私って誰でしたっけ?" history-20250118-1830.txt
```

Output:
```
Taro: もちろんです！ 😊 あなたはShumpeiさんですよ。 何かお手伝いしましょうか？ 
```

「もちろんです！」って何に対してだろうか?

```sh
cat history-20250118-1830.txt
```

Output:
```
User: こんにちは。私の名前はShumpeiです。
Taro: こんにちは、Shumpeiさん。

お会いできて嬉しいです。何か私にできることはありますか？ 😊 
User: 私って誰でしたっけ?
Taro: Taro: もちろんです！ 😊 あなたはShumpeiさんですよ。 何かお手伝いしましょうか？ 
```

```sh
bash chat.sh "「もちろんです！」とは何に対しての回答ですか？" history-20250118-1830.txt
```

Output:
```
Taroの「もちろんです！」は、Shumpeiさんの「私って誰でしたっけ？」という質問に対して、相手の名前を覚えていることを強調し、安心させるための相槌として使われています。

つまり、「あなたのことを覚えていますよ！（もちろんです！）」と伝え、その後に「あなたはShumpeiさんですよ」と、名前を再確認する流れになっています。 
```

## (2) Rewrite

今後の拡張のためにJavaScriptに書き換える。

commit: 97f7792da70d9ae32c56066db61de2f5c609f892

```sh
bash chat.sh "$(cat <<EOF
以下のスクリプトをJavaScriptに書き換えてください。

- Node.js v22で実行します。
- npmパッケージは使わず、標準ライブラリのみで実装してください。

$(cat chat.sh)
EOF
)" history-20250118-2140.txt
```

Output: [history-20250118-2140.txt](history-20250118-2140.txt)

引数の順序が変わっていたり、エラーハンドリングなど粗い部分があるが、先に進める。

## (3) Actions

まずはコードを書けるように、ファイルの書き込みができるようにする。

commit: a93d539cb577b2e04a1163a0a3f4450005f83387

toolの呼び出し方を system_instruction.md に追記。

```sh
node chat.js history-20250119-1100.txt "買い物リストを作るのを手伝ってほしいです。徐々に思い出しながら伝えるので、すべて思い出したら内容をファイルに保存してください。"
```

Output: [history-20250119-1100.txt](history-20250119-1100.txt)

- system instructionで指定したフォーマットにしたがって、ファイル保存のリクエストができている。
- 改行を `\n` で表現しているのはこのままで良い?
- contentの中にxmlが入る場合はどうする？

フォーマットの詳細は後で考えることにして、LLMの返答にあるリクエスト内容をパースして実行できるようにする。

```sh
node chat.js history-20250119-1120.txt "$(cat <<EOF
LLMがファイル書き込みなどのアクションを実行できるように拡張したいです。

以下のような流れで実装すると良いでしょう。

- LLMの返答にあるtoolのリクエストをパースする処理
- Userの承認を得てtoolのリクエストを実行する処理
- write_fileの実装

まずは、toolのリクエストをパースしてconsole.logで出力する処理を追加してください。
- Node.js v22で実行できるようにしてください。
- パースには正規表現を使うと良いでしょう。
- コードは省略せずに書いてください。

LLMとやり取りするスクリプト：
<file_content path="chat.js">
$(cat chat.js)
</file_content>

System Instruction:
<file_content path="system_instruction.md">
$(cat system_instruction.md)
</file_content>
EOF
)"
```

出力したスクリプトを `agent-v1.js` として保存。

```sh
node agent-v1.js history-tmp.txt "「Hello, World\!」という内容をファイル hello.txt に書き込んでください。"
```

Output:
```
<write_file>
  <file_path>hello.txt</file_path>
  <content>Hello, World!</content>
</write_file> 

Tool Request: {
  toolName: 'write_file',
  parameters: { file_path: 'hello.txt', content: 'Hello, World!' }
}
```

tools呼び出しが複数あると最初のものしかparseされないが後で考える。
次に、Userの承認を求めるように拡張してもらう。

```sh
node chat.js history-20250119-1420.txt "$(cat <<EOF
LLMがファイル書き込みなどのアクションを実行できるように拡張したいです。

以下のような流れで実装すると良いでしょう。

- LLMの返答にあるtoolのリクエストをパースする処理
- Userの承認を得てtoolのリクエストを実行する処理
- write_fileの実装

toolsのリクエストをパースする処理までできたので、
次はUserの承認を得てtoolを実行する処理を書きましょう。
write_fileのは未実装なので、Userの承認を得られたらtoolsへのリクエストをconsole.log
で出力するところまで書いてください。

- 実装にあたって、明確にすべきポイントがあれば、すべて明確になるまで質問してください。
- コードを提示する場合は省略せずにすべて提示してください
- 実行環境はNode.js v22です
- 標準ライブラリのみを利用してください

拡張したいスクリプト：
<file_content path="chat.js">
$(cat chat.js)
</file_content>

System Instruction:
<file_content path="system_instruction.md">
$(cat system_instruction.md)
</file_content>
EOF
)"
```

Output: [history-20250119-1420.txt](history-20250119-1420.txt)

出力したスクリプトをagent-v2.jsとして保存。
まちがえて、古いバージョンの chat.js を与えていたが、気にせず先に進む。

```sh
rm -f history-tmp.txt && node agent-v2.js history-tmp.txt "Hello, World\!という文字列をhello.txtに書き込んでください"
```

Output:
<pre><code>
```tool_code
<write_file>
  <file_path>hello.txt</file_path>
  <content>Hello, World\!</content>
</write_file>
```

これでよろしいでしょうか？実行してよろしいですか？
LLMは以下のツールを実行しようとしました:
[
  {
    "name": "write_file",
    "parameters": {
      "file_path": "hello.txt",
      "content": "Hello, World\\!"
    }
  }
]
ツールを実行しますか？ (y/n): y
ツールリクエスト: [
  {
    "name": "write_file",
    "parameters": {
      "file_path": "hello.txt",
      "content": "Hello, World\\!"
    }
  }
]
</code></pre>

- xmlのパース処理が壊れてしまったので部分的に戻してもらった

Commit: d9124eca0ad0e82d41007c7e9d15e77504986ff8

write_fileを実装してファイルを書き込めるようにする。

```sh
node chat.js history-20250119-1500.txt "$(cat <<EOF
LLMがファイル書き込みなどのアクションを実行できるように拡張したいです。

以下のような流れで実装すると良いでしょう。

- LLMの返答にあるtoolのリクエストをパースする処理
- Userの承認を得てtoolのリクエストを実行する処理
- write_fileの実装

Userの承認を得るところまでは実装ができたので、次はwrite_fileを実装して、
LLMがファイルを書き込めるようにしましょう。

- 実装にあたって、明確にすべきポイントがあれば、すべて明確になるまで質問してください。
- コードを提示する場合は省略せずにすべて提示してください
- 実行環境はNode.js v22です
- 標準ライブラリのみを利用してください

拡張したいスクリプト：
<file_content path="agent-v2.js">
$(cat agent-v2.js)
</file_content>

System Instruction:
<file_content path="system_instruction.md">
$(cat system_instruction.md)
</file_content>
EOF
)"
```

Output: [history-20250119-1500.txt](history-20250119-1500.txt)

出力したスクリプトを agent-v3.js として保存。

```sh
rm -f history-tmp.txt && node agent-v3.js history-tmp.txt "Hello, World\!という文字列をhello.txtに書き込んでください"
```

Output:
```
<write_file>
  <file_path>hello.txt</file_path>
  <content>Hello, World!</content>
</write_file> これでどうでしょうか？ ファイルに書き込みますか？ 

LLMは以下のツールを実行しようとしました:
[
  {
    "name": "write_file",
    "parameters": {
      "file_path": "hello.txt",
      "content": "Hello, World!"
    }
  }
]
ツールを実行しますか？ (y/n): y
ツール write_file を実行しています...
ファイル hello.txt に書き込みました。
```
