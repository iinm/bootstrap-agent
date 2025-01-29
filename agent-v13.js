const fs = require('fs');
const { exec } = require('child_process');

// APIキーとモデルコードの設定
const API_KEY = fs.readFileSync('.secrets/gemini-api-key.txt', 'utf-8').trim();
const MODEL_CODE = 'models/gemini-1.5-pro-001';

// システムインストラクションの読み込み
const SYSTEM_INSTRUCTION = fs.readFileSync('system_instruction.md', 'utf-8');

// 会話履歴ファイル名の取得
const HISTORY_FILE = process.argv[2] || 'history.json';

// エラー処理関数の定義
function handleError(error, response) {
  console.error('エラーが発生しました:', error);
  console.error('レスポンス:', response);
  process.exit(1);
}

// 会話履歴の読み込み
/**
 * @return {Promise<Array<{role: string, parts: Array<{text: string}>}>>} 会話履歴
 */
async function loadHistory() {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    // ファイルが存在しない場合は空の履歴を使用
    return [];
  }
}

// XMLをパースしてツール名とパラメータを取得する
/**
 * @param {string} xmlString - パース対象のXML文字列
 * @return {Array<{name: string, parameters: object}>} ツール名とパラメータの配列
 */
function parseToolRequest(xmlString) {
  // XML文字列からtool_request要素を抽出
  const toolRequestMatch = xmlString.match(/<tool_request>(.*?)<\/tool_request>/s);

  // tool_request要素が存在しない場合は空の配列を返す
  if (!toolRequestMatch) {
    return [];
  }

  const tools = [];
  const toolMatches = toolRequestMatch[1].matchAll(/<(\w+)>(.*?)<\/\1>/gs);

  for (const match of toolMatches) {
    const toolName = match[1];
    const parameters = {};
    const parameterMatches = match[2].matchAll(/<(\w+)>(.*?)<\/\1>/gs);

    for (const parameterMatch of parameterMatches) {
      parameters[parameterMatch[1]] = parameterMatch[2];
    }

    tools.push({ name: toolName, parameters });
  }

  // tool_name要素が複数ある場合はエラー
  if (tools.length > 1) {
    throw new Error('tool_request要素内にはtool_name要素は1つだけにしてください。');
  }

  return tools;
}

// ツールの実行
/**
 * @param {{name: string, parameters: object}} tool - 実行するツールの情報
 * @return {Promise<string>} ツールの実行結果
 */
async function executeTool(tool) {
  switch (tool.name) {
    case 'write_file':
      return await executeWriteFile(tool.parameters);
    case 'find_cmd':
      return await executeFindCmd(tool.parameters);
    case 'read_file':
      return await executeReadFile(tool.parameters);
    default:
      throw new Error(`Unknown tool: ${tool.name}`);
  }
}

// write_fileツールの実行
/**
 * @param {{file_path: string, content: string}} parameters - ツールのパラメータ
 * @return {Promise<string>} ツールの実行結果
 */
async function executeWriteFile(parameters) {
  const filePath = parameters.file_path;
  const content = parameters.content;

  try {
    fs.writeFileSync(filePath, content);
    console.log(`ファイル ${filePath} に書き込みました。`);
    return `ファイル ${filePath} に書き込みました。`;
  } catch (error) {
    throw new Error(`ファイル書き込みエラー: ${error.message}`);
  }
}

// find_cmdツールの実行
/**
 * @param {{path: string, depth?: string, args?: string}} parameters - ツールのパラメータ
 * @return {Promise<string>} ツールの実行結果
 */
async function executeFindCmd(parameters) {
  const path = parameters.path;
  const depth = parameters.depth || '1';
  const args = parameters.args || '';

  // findコマンドの実行
  const command = `find ${path} -maxdepth ${depth} ${args}`;
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`findコマンドの実行エラー: ${error.message}`));
        return;
      }
      if (stderr) {
        reject(new Error(`findコマンドの標準エラー出力: ${stderr}`));
        return;
      }
      console.log(`findコマンドの実行結果:\n${stdout}`);
      resolve(stdout);
    });
  });
}

// read_fileツールの実行
/**
 * @param {{file_path: string}} parameters - ツールのパラメータ
 * @return {Promise<string>} ツールの実行結果
 */
async function executeReadFile(parameters) {
  const filePath = parameters.file_path;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`ファイル ${filePath} を読み込みました。`);
    return content;
  } catch (error) {
    throw new Error(`ファイル読み込みエラー: ${error.message}`);
  }
}

// LLMからの応答を処理
/**
 * @param {object} response - LLMからの応答
 * @param {Array<{role: string, parts: Array<{text: string}>}>} history - 会話履歴
 */
async function handleLLMResponse(response, history) {
  const generatedText = response.candidates[0].content.parts[0].text;

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
          const result = await executeTool(tool);

          // ツールの実行結果を会話履歴に追加
          history.push({
            role: 'user', // roleはuserのまま
            parts: [{
              text: `<tool_result tool_name="${tool.name}">${result}</tool_result>`, // タグで囲む
            }],
          });

          // 会話履歴の保存
          fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

          // 再帰的にLLMの呼び出し
          await main(false);
          return; // ツール実行後は再帰呼び出しから抜ける
        } catch (error) {
          console.error(`ツールの実行中にエラーが発生しました: ${error.message}`);
        }
      }
    } else {
      console.log('ツールの実行はキャンセルされました。');
    }
  }
}

// メイン関数
/**
 * @param {boolean} [isFirstCall=true] - 初回呼び出かどうか
 */
async function main(isFirstCall = true) {
  try {
    // 会話履歴の読み込み
    let history = await loadHistory();

    // ユーザー入力の取得
    const USER_INPUT = process.argv[3];

    // 会話履歴に追加で追記するテキストを結合
    if (isFirstCall) {
      history.push({
        role: 'user',
        parts: [{ text: USER_INPUT }],
      });
    }

    // JSONペイロードの作成
    const jsonPayload = JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: history,
      generationConfig: {
        temperature: 0
      },
      safetySettings: [
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
      ]
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

    // 日時と出力内容を debug.log ファイルに書き込む
    const now = new Date().toLocaleString();
    fs.writeFileSync('debug.log', `[${now}] API レスポンス: ${JSON.stringify(response, null, 2)}\n`, { flag: 'a' });

    const generatedText = response.candidates[0].content.parts[0].text;

    // LLMの応答を履歴に追加
    history.push({
      role: 'model',
      parts: [{ text: generatedText }],
    });

    // 会話履歴の保存
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    // LLMの応答処理
    await handleLLMResponse(response, history);
  } catch (error) {
    handleError('APIリクエストエラー', error);
  }
}

// メイン関数の実行
main();
