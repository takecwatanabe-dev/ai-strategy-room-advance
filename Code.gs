/**
 * APP: AI Strategy Room
 * FILE: Code.gs
 * VERSION: v9.2.1-Full-Feature
 * AUTHOR: Gemini
 *
 * FEATURES:
 * - Model: gemini-2.5-flash
 * - UI: 3-Column Layout (Stable)
 * - GitHub: Upload (Write) & Fetch (Read) enabled
 */

const APP_VERSION = 'v9.2.1-Full-Feature';
const FOLDER_NAME = "AI_Strategy_Room_Images"; 
const LOG_SHEET_NAME = "AI_Strategy_Room_Log_v6"; 
const MAX_IMAGE_SIZE_MB = 4; 

const COMMON_INSTRUCTION = `
【重要: 出力形式の厳守】
1. 言語は必ず「日本語」のみを使用すること。
2. 回答の冒頭に、必ず議論の「短いタイトル（20文字以内）」を **### タイトル** 形式で出力すること。
3. コードを出力する際は、必ずMarkdownのコードブロック（\`\`\`言語名 ... \`\`\`）で囲むこと。
`;
const PERSONA_YUI = `あなたは「AI Strategy Room」の秘書兼ファシリテーター、Yuiです。丁寧で親しみやすい口調で、必ず日本語で話します。${COMMON_INSTRUCTION}`;
const PERSONA_REX = `お前は「AI Strategy Room」のレッドチーム、Rexだ。断定的で簡潔に、必ず日本語で話せ。批判的視点を持て。${COMMON_INSTRUCTION}`;
const PERSONA_GEMINI = `私はGoogleの最新AI、Gemini 2.5です。論理的・分析的に、必ず日本語で話します。${COMMON_INSTRUCTION}`;

function doGet(e) {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle(`AI Strategy Room ${APP_VERSION}`)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

function logUserAction(sessionId, theme, title) {
  try { logToSheet(sessionId, "User", theme, title || "（タイトル未定）"); } catch(e) {}
}

// ★GitHubへのアップロード機能
function uploadToGithub(fileName, content) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO'); 
  
  if (!token || !repo) return "❌ エラー: GITHUB_TOKEN または GITHUB_REPO が設定されていません。";

  if (!fileName.includes('.')) fileName += '.txt';
  const url = `https://api.github.com/repos/${repo}/contents/${fileName}`;
  
  // SHA取得（上書き用）
  let sha = null;
  try {
    const check = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": `Bearer ${token}` },
      muteHttpExceptions: true
    });
    if (check.getResponseCode() === 200) {
      sha = JSON.parse(check.getContentText()).sha;
    }
  } catch(e) {}

  // アップロード実行
  const payload = {
    message: `Update ${fileName} via AI Strategy Room (${APP_VERSION})`,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    ...(sha && { sha: sha })
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: "put",
      headers: { "Authorization": `Bearer ${token}` },
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() < 300) {
      const json = JSON.parse(res.getContentText());
      return `✅ GitHub保存完了: ${fileName}`;
    } else {
      return `❌ GitHubエラー (${res.getResponseCode()}): ${res.getContentText()}`;
    }
  } catch (e) {
    return `❌ 通信エラー: ${e.message}`;
  }
}

// ★GitHubからの読み込み機能 (コマンド @code 対応)
function fetchGithubCodeByCommand(text) {
  const regex = /(@code|@c)\s+([^\s\n]+)/gi;
  let match;
  const props = PropertiesService.getScriptProperties();
  const ghToken = (props.getProperty('GITHUB_TOKEN')||"").trim();
  const ghRepo = (props.getProperty('GITHUB_REPO')||"").trim();
  
  if (!ghToken || !ghRepo) return [{ success: false, error: "❌ GITHUB_TOKEN/REPO 未設定" }];

  const results = [];
  while ((match = regex.exec(text)) !== null) {
    const targetFile = match[2].trim();

    if (['list', 'ls', '.', '/', '//'].includes(targetFile)) {
      results.push({ success: true, code: listGithubFiles(ghRepo, ghToken), path: 'list' });
      continue;
    }

    const candidates = generateFallbackPaths(targetFile);
    let found = false;
    for (const path of candidates) {
      try {
        const url = `https://api.github.com/repos/${ghRepo}/contents/${encodeURIComponent(path)}`;
        const res = UrlFetchApp.fetch(url, { method: "get", headers: { "Authorization": "Bearer " + ghToken, "Accept": "application/vnd.github.v3.raw" }, muteHttpExceptions: true });
        
        if (res.getResponseCode() === 200) {
          const content = res.getContentText();
          const display = content.length > 50000 ? content.substring(0, 50000) + "\n... (Truncated)" : content;
          results.push({ success: true, code: `\n\n--- GitHub Code: ${path} ---\n\`\`\`javascript\n${display}\n\`\`\`\n`, path: targetFile, actualPath: path });
          found = true;
          break;
        }
      } catch(e) {}
    }
    if (!found) results.push({ success: false, error: `❌ File not found: ${targetFile}` });
  }
  return results;
}

function generateFallbackPaths(filePath) {
  const parts = filePath.split('/');
  const name = parts.pop();
  const dir = parts.join('/');
  const extMatch = name.match(/^(.+)(\.[^.]+)$/);
  if (!extMatch) return [filePath];
  const candidates = [filePath];
  ['.gs', '.html', '.js', '.json', '.md'].forEach(ext => candidates.push((dir ? dir + '/' : '') + name + ext));
  return candidates;
}

function listGithubFiles(repo, token) {
  try {
    const res = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/`, { method: "get", headers: { "Authorization": "Bearer " + token }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const files = JSON.parse(res.getContentText());
      return "📂 **GitHub File List:**\n" + files.map(f => `- ${f.name}`).join("\n");
    }
    return "List Error";
  } catch (e) { return "List Error"; }
}

function runRelay(theme, title, imagesBase64, aiModel, historyPayload, sessionId) {
  if (imagesBase64 && imagesBase64.length > 0) {
    const sizeCheck = validateImageSize(imagesBase64);
    if (!sizeCheck.ok) return { status: "success", response: `⚠️ 画像サイズ過大: ${sizeCheck.sizeMB}MB`, ver: APP_VERSION };
    try { saveImagesToDriveSafe(theme, imagesBase64); } catch (e) {}
  }

  // GitHub読み込み処理
  let systemMessages = [];
  if (theme.includes("@code") || theme.includes("@c ")) {
    try {
      const githubResults = fetchGithubCodeByCommand(theme);
      if (githubResults.length > 0) {
        githubResults.forEach(res => {
          if (res.success) {
            theme += `\n\n${res.code}\n`;
            systemMessages.push(`【System】GitHub Loaded: ${res.path}`);
          }
        });
      }
    } catch(e) {}
  }

  let finalPrompt = theme;
  if (title && title.trim() !== "") finalPrompt = `【議題: ${title}】\n\n${theme}`;
  else finalPrompt = `${theme}\n\n(※この議論のタイトルを **### タイトル** の形式で冒頭に付けてください)`;

  let responseText = "";
  try {
    responseText = callAIWithHistory(finalPrompt, imagesBase64, aiModel, historyPayload);
    if (systemMessages.length > 0) responseText = systemMessages.join('\n') + "\n\n" + responseText;
    logToSheet(sessionId, aiModel, responseText, title || "（AI生成中）");
  } catch (e) {
    responseText = makeFriendlyErrorMessage(e.message || String(e));
    logToSheet(sessionId, aiModel, "ERROR: " + e.message, title);
  }

  return { status: "success", response: responseText, ver: APP_VERSION, appVersion: APP_VERSION };
}

// AI Calls
function callAIWithHistory(prompt, images, model, historyPayload) {
  const props = PropertiesService.getScriptProperties();
  const m = model.toLowerCase();
  let hist = historyPayload?.perAIHistory?.[m] || [];

  if (m === 'yui') {
    const apiKey = (props.getProperty('OPENAI_API_KEY') || "").trim();
    if (!apiKey) throw new Error("API Key not set for Yui");
    let messages = [{ role: "system", content: PERSONA_YUI }, ...hist];
    if (images?.length) {
      let content = [{ type: "text", text: prompt }];
      images.forEach(img => content.push({ type: "image_url", image_url: { url: img } }));
      messages.push({ role: "user", content: content });
    } else messages.push({ role: "user", content: prompt });
    return fetchApi("https://api.openai.com/v1/chat/completions", apiKey, { model: "gpt-4o", messages: messages, temperature: 0.3 }, "Bearer", "openai");
  }
  
  if (m === 'rex') {
    const apiKey = (props.getProperty('ANTHROPIC_API_KEY') || props.getProperty('CLAUDE_API_KEY') || "").trim();
    if (!apiKey) throw new Error("API Key not set for Rex");
    let messages = [...hist];
    if (images?.length) {
      let content = [];
      images.forEach(img => {
        const match = String(img).match(/^data:(.+);base64,(.+)$/);
        const media_type = match ? match[1] : "image/jpeg";
        const data = match ? match[2] : String(img);
        content.push({ type: "image", source: { type: "base64", media_type: media_type, data: data } });
      });
      content.push({ type: "text", text: prompt });
      messages.push({ role: "user", content: content });
    } else messages.push({ role: "user", content: prompt });
    return fetchApi("https://api.anthropic.com/v1/messages", apiKey, { model: "claude-3-haiku-20240307", system: PERSONA_REX, messages: messages, max_tokens: 1500 }, "x-api-key", "anthropic");
  }
  
  if (m === 'gemini') {
    let apiKey = (props.getProperty('GEMINI_API_KEY') || props.getProperty('GOOGLE_API_KEY') || "").trim();
    if (!apiKey) throw new Error("GEMINI_API_KEYが設定されていません。");
    
    // 診断リストで確認された、確実に動くモデル
    const modelName = 'gemini-2.5-flash'; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    let contents = hist.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] }));
    let parts = [{ text: prompt }];
    if (images?.length) {
      images.forEach(img => {
        const match = String(img).match(/^data:(.+);base64,(.+)$/);
        parts.push({ inline_data: { mime_type: match?match[1]:"image/jpeg", data: match?match[2]:String(img) } });
      });
    }
    contents.push({ role: "user", parts: parts });

    return fetchGemini(url, { 
      system_instruction: { parts: [{ text: PERSONA_GEMINI }] }, 
      contents: contents,
      safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }]
    });
  }
  return "Error: Unknown Model";
}

// Utils
function fetchApi(url, token, payload, authType, serviceName) { const headers = {}; if (authType === "Bearer") headers["Authorization"] = "Bearer " + token; else headers["x-api-key"] = token; if (serviceName === "anthropic") headers["anthropic-version"] = "2023-06-01"; const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true }); const json = JSON.parse(res.getContentText()); if (res.getResponseCode() !== 200) throw new Error(json.error?.message || JSON.stringify(json)); return serviceName === "openai" ? json.choices[0].message.content : json.content[0].text; }
function fetchGemini(url, payload) { try { const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true }); const json = JSON.parse(res.getContentText()); if (res.getResponseCode() === 200) { const content = json.candidates?.[0]?.content?.parts?.[0]?.text; if (content) return content; return "(No content)"; } return `Gemini Error ${res.getResponseCode()}: ${json.error?.message || res.getContentText()}`; } catch (e) { return `Gemini Exception: ${e.message}`; } }
function validateImageSize(imagesBase64) { let totalSize = 0; for (let i = 0; i < imagesBase64.length; i++) totalSize += String(imagesBase64[i]).length * 0.75; const sizeMB = totalSize / (1024 * 1024); return { ok: sizeMB <= MAX_IMAGE_SIZE_MB, sizeMB: Math.round(sizeMB * 10) / 10 }; }
function makeFriendlyErrorMessage(rawError) { const str = String(rawError); if (str.includes("Overloaded") || str.includes("503")) return "⚠️ **混雑中**: AIサーバーが混み合っています。"; if (str.includes("Key") || str.includes("401")) return "⚠️ **設定エラー**: APIキー設定を確認してください。"; return `⚠️ **エラー**: ${str}`; }
function logToSheet(sessionId, speaker, content, title) { const files = DriveApp.getFilesByName(LOG_SHEET_NAME); let sheet; if (files.hasNext()) sheet = SpreadsheetApp.open(files.next()).getSheets()[0]; else { const ss = SpreadsheetApp.create(LOG_SHEET_NAME); sheet = ss.getSheets()[0]; sheet.appendRow(["Timestamp", "Session ID", "Title", "Speaker", "Content", "Ver"]); } sheet.appendRow([new Date(), sessionId, title, speaker, content, APP_VERSION]); }
function getLogList() { try { const files = DriveApp.getFilesByName(LOG_SHEET_NAME); if (!files.hasNext()) return []; const sheet = SpreadsheetApp.open(files.next()).getSheets()[0]; const data = sheet.getDataRange().getValues(); const sessions = {}; for (let i = 1; i < data.length; i++) { const row = data[i]; if (!sessions[row[1]]) sessions[row[1]] = { time: Utilities.formatDate(new Date(row[0]), "JST", "MM/dd HH:mm"), title: row[2] || "(無題)", id: row[1] }; } return Object.values(sessions).reverse().slice(0,10); } catch (e) { return []; } }
function deleteLog(sessionId) { try { const files = DriveApp.getFilesByName(LOG_SHEET_NAME); if (!files.hasNext()) return { success: false }; const sheet = SpreadsheetApp.open(files.next()).getSheets()[0]; const data = sheet.getDataRange().getValues(); for (let i = data.length - 1; i >= 1; i--) { if (String(data[i][1]) === String(sessionId)) sheet.deleteRow(i + 1); } return { success: true }; } catch(e) { return { success: false }; } }
function getSessionLogs(sessionId) { const files = DriveApp.getFilesByName(LOG_SHEET_NAME); if (!files.hasNext()) return []; const sheet = SpreadsheetApp.open(files.next()).getSheets()[0]; const data = sheet.getDataRange().getValues(); const logs = []; for (let i = 1; i < data.length; i++) { if (String(data[i][1]) === String(sessionId)) logs.push({ time: Utilities.formatDate(new Date(data[i][0]), "JST", "HH:mm"), speaker: data[i][3], content: data[i][4], title: data[i][2] }); } return logs; }
function saveImagesToDriveSafe(theme, imagesBase64) { let folder = DriveApp.getFoldersByName(FOLDER_NAME).hasNext() ? DriveApp.getFoldersByName(FOLDER_NAME).next() : DriveApp.createFolder(FOLDER_NAME); return imagesBase64.map((b64, i) => { try { const m = String(b64).match(/^data:(.+?);base64,(.+)$/); if(!m) return null; return folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], `img_${Date.now()}_${i}`)).getUrl(); } catch(e) { return null; } }); }