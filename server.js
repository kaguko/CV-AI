const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch { /* dùng biến môi trường hệ thống */ }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'careerai-data.json');
const JOBS_FILE = path.join(ROOT_DIR, 'jobs-data.json');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function sanitizeGeminiResult(parsed) {
  const rawScore = Number.parseInt(parsed?.score, 10);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : null;
  const summary = typeof parsed?.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 5)
    : [];
  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills.map((skill) => {
        if (!Array.isArray(skill) || skill.length < 3) return null;
        const name = typeof skill[0] === 'string' ? skill[0].trim() : '';
        if (!name) return null;
        const rawPct = Number(skill[1]);
        const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, Math.round(rawPct))) : 0;
        const needsWork = typeof skill[2] === 'boolean' ? skill[2] : pct < 60;
        return [name, pct, needsWork];
      }).filter(Boolean).slice(0, 5)
    : [];

  return { score, summary, recommendations, skills };
}

// ─── Gemini: trả về score, summary, recommendations, skills ───
async function analyzeWithGemini(cvText, jobLabel) {
  if (!GEMINI_API_KEY) { console.error('[Gemini] Missing GEMINI_API_KEY'); return null; }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const prompt = `Bạn là chuyên gia tuyển dụng tại Việt Nam. Hãy phân tích CV sau và đánh giá mức độ phù hợp với vị trí "${jobLabel}".

Trả về JSON hợp lệ duy nhất (không có markdown, không có text ngoài JSON) với format:
{
  "score": <số nguyên 0-100>,
  "summary": "<nhận xét tổng quan 1-2 câu về CV và mức độ phù hợp vị trí>",
  "recommendations": [
    "<đề xuất cải thiện cụ thể dựa trên nội dung CV, tối đa 5 mục>"
  ],
  "skills": [
    ["<tên kỹ năng quan trọng với vị trí>", <điểm 0-100 ứng viên hiện có>, <true nếu cần cải thiện (dưới 60)>]
  ]
}

Lưu ý:
- recommendations phải dựa vào nội dung CV thực tế, không nói chung chung
- skills liệt kê 4-5 kỹ năng cốt lõi của vị trí ${jobLabel}
- Trả lời hoàn toàn bằng tiếng Việt

CV:
${String(cvText || '').slice(0, 6000)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
      })
    });

    const rawText = await res.text();
    if (!res.ok) { console.error('[Gemini] HTTP error:', res.status, rawText); return null; }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { console.error('[Gemini] Parse error:', e.message); return null; }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) { console.error('[Gemini] Empty response'); return null; }

    try {
      const parsed = JSON.parse(text);
      return sanitizeGeminiResult(parsed);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) { console.error('[Gemini] No JSON in response:', text); return null; }
      try {
        const parsed = JSON.parse(match[0]);
        return sanitizeGeminiResult(parsed);
      } catch (e) { console.error('[Gemini] Fallback parse error:', e.message); return null; }
    }
  } catch (error) {
    console.error('[Gemini] Network error:', error);
    return null;
  }
}

function loadJobs() {
  try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); }
  catch {
    return {
      marketing:      { label: 'Marketing Manager' },
      finance:        { label: 'Financial Analyst' },
      technology:     { label: 'Software Engineer' },
      humanresources: { label: 'HR Specialist' },
      accounting:     { label: 'Accountant' },
      logistics:      { label: 'Logistics Coordinator' }
    };
  }
}

const VALID_CV_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt']);

function getDefaultState() {
  return {
    selectedJobKey: 'marketing',
    selectedFileName: '',
    history: [],
    messages: [],
    lastResult: null,
    startedAnalysisAt: null,
    analysisFinishedAt: null
  };
}

function isValidJobKey(key) { return Object.prototype.hasOwnProperty.call(loadJobs(), key); }

function isValidCvFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) return false;
  return VALID_CV_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function dedupeHistoryEntries(history) {
  const seen = new Set();
  return history.filter((entry) => {
    const key = JSON.stringify([entry?.position || '', entry?.score || '', entry?.date || '']);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeState(state) {
  const safeState = { ...getDefaultState(), ...(state || {}) };
  const selectedJobKey = isValidJobKey(safeState.selectedJobKey) ? safeState.selectedJobKey : 'marketing';
  const selectedFileName = isValidCvFileName(safeState.selectedFileName) ? safeState.selectedFileName : '';
  const lastResult = safeState.lastResult && typeof safeState.lastResult === 'object'
    ? {
        ...safeState.lastResult,
        jobKey: isValidJobKey(safeState.lastResult.jobKey) ? safeState.lastResult.jobKey : selectedJobKey,
        fileName: isValidCvFileName(safeState.lastResult.fileName) ? safeState.lastResult.fileName : ''
      }
    : null;
  return {
    ...safeState, selectedJobKey, selectedFileName, lastResult,
    history: dedupeHistoryEntries(Array.isArray(safeState.history) ? safeState.history : []),
    messages: Array.isArray(safeState.messages) ? safeState.messages : []
  };
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function writeJson(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); }

function loadState() {
  const loaded = normalizeState({ ...getDefaultState(), ...readJson(DATA_FILE, {}) });
  saveState(loaded);
  return loaded;
}

function saveState(state) { writeJson(DATA_FILE, normalizeState(state)); }
function getJob(key) { const J = loadJobs(); return J[key] || J.marketing; }

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-API-Key'
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...getCorsHeaders() });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType) {
  res.writeHead(statusCode, { 'Content-Type': `${contentType}; charset=utf-8`, ...getCorsHeaders() });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
    '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
    '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.pdf':'application/pdf', '.ico':'image/x-icon' };
  return map[ext] || 'application/octet-stream';
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) { reject(new Error('Payload too large')); req.destroy(); } });
    req.on('end', () => { if (!body) { resolve({}); return; } try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!API_SECRET) return true;
  return req.headers['x-api-key'] === API_SECRET;
}

function ensureDataFile() { if (!fs.existsSync(DATA_FILE)) saveState(getDefaultState()); }

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT_DIR, requestedPath));
  if (!filePath.startsWith(ROOT_DIR)) { sendText(res, 403, 'Forbidden', 'text/plain'); return; }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(ROOT_DIR, 'index.html'), (fallbackError, fallbackData) => {
        if (fallbackError) { sendText(res, 404, 'Not Found', 'text/plain'); return; }
        sendText(res, 200, fallbackData.toString('utf8'), 'text/html');
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': getContentType(filePath), ...getCorsHeaders() });
    res.end(data);
  });
}

async function analyzeState(statePatch) {
  const state = loadState();
  const incomingPatch = statePatch && typeof statePatch === 'object' ? statePatch : {};
  const { history: _ignoredHistory, ...safePatch } = incomingPatch;
  const selectedJobKey = safePatch.selectedJobKey || state.selectedJobKey || 'marketing';
  const job = getJob(selectedJobKey);
  const analysisFinishedAt = Date.now();

  let score = null;
  let aiSummary = null;
  let recommendations = [];
  let skills = [];
  let simulated = true;

  const cvText = typeof safePatch.cvText === 'string' ? safePatch.cvText.trim() : '';

  if (!cvText) {
    console.error('[Analyze] cvText rỗng — hãy upload file CV có nội dung text');
  } else if (!GEMINI_API_KEY) {
    console.error('[Analyze] Không có GEMINI_API_KEY — trả về empty-state mô phỏng');
  } else {
    const aiResult = await analyzeWithGemini(cvText, job.label);
    if (aiResult) {
      score = Math.min(100, Math.max(0, Number(aiResult.score) || 0));
      aiSummary = aiResult.summary || null;
      recommendations = Array.isArray(aiResult.recommendations) ? aiResult.recommendations : [];
      skills = Array.isArray(aiResult.skills) ? aiResult.skills : [];
      simulated = false;
    } else {
      console.error('[Analyze] Gemini không trả kết quả hợp lệ — trả về empty-state');
    }
  }

  const lastResult = {
    jobKey: selectedJobKey,
    score,
    jobLabel: job.label,
    fileName: safePatch.selectedFileName || state.selectedFileName || '',
    aiSummary,
    recommendations,
    skills,
    simulated
  };

  const history = score === null
    ? state.history
    : [{
        position: job.label,
        score: `${score}/100`,
        date: new Intl.DateTimeFormat('vi-VN').format(new Date(analysisFinishedAt))
      }, ...state.history].slice(0, 10);

  const nextState = normalizeState({
    ...state,
    ...safePatch,
    selectedJobKey,
    analysisFinishedAt,
    lastResult,
    history
  });

  saveState(nextState);
  return nextState;
}

async function handleApi(req, res, pathname) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized. Provide X-API-Key header.' });
    return true;
  }
  if (pathname === '/api/state' && req.method === 'GET') { sendJson(res, 200, loadState()); return true; }
  if (pathname === '/api/state' && (req.method === 'PUT' || req.method === 'PATCH')) {
    const patch = await parseBody(req);
    const nextState = normalizeState({ ...loadState(), ...patch });
    saveState(nextState);
    sendJson(res, 200, nextState);
    return true;
  }
  if (pathname === '/api/messages' && req.method === 'POST') {
    const message = await parseBody(req);
    const state = loadState();
    saveState({ ...state, messages: [...state.messages, message].slice(0, 100) });
    sendJson(res, 200, { ok: true, message });
    return true;
  }
  if (pathname === '/api/analyze' && req.method === 'POST') {
    const patch = await parseBody(req);
    const nextState = await analyzeState(patch);
    sendJson(res, 200, { ok: true, lastResult: nextState.lastResult, analysisFinishedAt: nextState.analysisFinishedAt, history: nextState.history });
    return true;
  }
  if (pathname === '/api/jobs' && req.method === 'GET') { sendJson(res, 200, loadJobs()); return true; }
  return false;
}

ensureDataFile();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }
  try {
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) sendJson(res, 404, { error: 'Not found' });
      return;
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`CareerAI server running at http://localhost:${PORT}`);
  console.log(`Gemini AI: ${GEMINI_API_KEY ? 'Đã bật ✅' : 'Chưa có key (set GEMINI_API_KEY trong .env)'}`);
  console.log(`API auth:  ${API_SECRET ? 'Đã bật ✅' : 'Tắt (set API_SECRET trong .env để bật)'}`);
});
