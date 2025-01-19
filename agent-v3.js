const fs = require('fs');

// APIキーとモデルコードの設定
const API_KEY = fs.readFileSync('.secrets/gemini-api-key.txt', 'utf-8').trim();
const MODEL_CODE = 'models/gemini-1.5-pro-001';

// システムインストラクションの読み込み
const SYSTEM_INSTRUCTION = fs.readFileSync('system_instruction.md', 'utf-8');

// 会話履歴ファイル名の取得
const HISTORY_FILE = process.argv[2] || 'history.txt';

// エラー処理関数の定義
function handleError(error, response) {
  console.error('エラーが発生しました:', error);
  console.error('レスポンス:', response);
  process.exit(1);
}

// 会話履歴の読み込み
async function loadHistory() {
  try {
    return fs.readFileSync(HISTORY_FILE, 'utf-8');
  } catch (err) {
    // ファイルが存在しない場合は空の履歴を使用
    return '';
  }
}
// XMLをパースしてツール名とパラメータを取得する
function parseToolRequest(xmlString) {
  const matches = xmlString.matchAll(/<(\w+)>(.*?)<\/\1>/gs);
  const tools = [];

  for (const match of matches) {
    const toolName = match[1];
    const parameters = {};
    const parameterMatches = match[2].matchAll(/<(\w+)>(.*?)<\/\1>/gs);

    for (const parameterMatch of parameterMatches) {
      parameters[parameterMatch[1]] = parameterMatch[2];
    }

    tools.push({ name: toolName, parameters });
  }

  return tools;
}
// ツールの実行
async function executeTool(tool) {
  switch (tool.name) {
    case 'write_file':
      return await executeWriteFile(tool.parameters);
    default:
      throw new Error(`Unknown tool: ${tool.name}`);
  }
}

// write_fileツールの実行
async function executeWriteFile(parameters) {
  const filePath = parameters.file_path;
  const content = parameters.content;

  try {
    fs.writeFileSync(filePath, content);
    console.log(`ファイル ${filePath} に書き込みました。`);
  } catch (error) {
    throw new Error(`ファイル書き込みエラー: ${error.message}`);
  }
}

// メイン関数
async function main() {
  try {
    // 会話履歴の読み込み
    const HISTORY = await loadHistory();

    // ユーザー入力の取得
    const USER_INPUT = process.argv[3];

    // JSONペイロードの作成
    const jsonPayload = JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: HISTORY }],
        },
        {
          role: 'user',
          parts: [{ text: USER_INPUT }],
        },
      ],
    });

    // APIリクエストの送信
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODEL_CODE}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonPayload,
    });

    if (!res.ok) {
      throw new Error(`APIリクエストエラー: ${res.status}`);
    }

    const response = await res.json();
    const generatedText = response.candidates[0].content.parts[0].text;

    // レスポンス全体を標準出力
    console.log(JSON.stringify(response, null, 2));

    // レスポンスのテキスト部分のみ出力
    console.log(generatedText);

    const tools = parseToolRequest(generatedText);

    // ユーザーにツールの使用許可を求める
    if (tools.length > 0) {
      console.log('LLMは以下のツールを実行しようとしました:');
      console.log(JSON.stringify(tools, null, 2));
      const answer = await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdout.write('ツールを実行しますか？ (y/n): ');
        process.stdin.on('data', (input) => {
          process.stdin.pause();
          resolve(input.trim().toLowerCase());
        });
      });
      if (answer === 'y') {
        // ツールの実行
        for (const tool of tools) {
          console.log(`ツール ${tool.name} を実行しています...`);
          try {
            await executeTool(tool);
          } catch (error) {
            console.error(`ツールの実行中にエラーが発生しました: ${error.message}`);
          }
        }
      } else {
        console.log('ツールの実行はキャンセルされました。');
      }
    }

    // 会話履歴の保存
    fs.appendFileSync(HISTORY_FILE, `User: ${USER_INPUT}\n`);
    fs.appendFileSync(HISTORY_FILE, `Taro: ${generatedText}\n`);

  } catch (error) {
    handleError('APIリクエストエラー', error);
  }
}

// メイン関数の実行
main();
