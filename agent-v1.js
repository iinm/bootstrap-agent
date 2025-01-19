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

// Tool Requestのパース関数
function parseToolRequest(text) {
  const toolRegex = /<(\w+)>(.*?)<\/\1>/s;
  const match = text.match(toolRegex);

  if (!match) {
    return null;
  }

  const toolName = match[1];
  const content = match[2];

  const parameters = {};
  const paramRegex = /<(\w+)>(.*?)<\/\1>/g;
  let paramMatch;
  while ((paramMatch = paramRegex.exec(content)) !== null) {
    parameters[paramMatch[1]] = paramMatch[2].trim();
  }

  return { toolName, parameters };
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

    // 会話履歴の保存
    fs.appendFileSync(HISTORY_FILE, `User: ${USER_INPUT}\n`);
    fs.appendFileSync(HISTORY_FILE, `Taro: ${generatedText}\n`);

    // レスポンスのテキスト部分のみ出力
    console.log(generatedText);

    // Tool Requestのパース
    const toolRequest = parseToolRequest(generatedText);
    console.log("Tool Request:", toolRequest);
  } catch (error) {
    handleError('APIリクエストエラー', error);
  }
}

// メイン関数の実行
main();
