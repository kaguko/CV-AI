const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ─── Load biến môi trường từ file .env nếu có ───
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
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Không có .env — dùng biến môi trường hệ thống (cho Render/Vercel)
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'careerai-data.json');
const JOBS_FILE = path.join(ROOT_DIR, 'jobs-data.json');

// ─── Cấu hình bảo mật (lấy từ .env hoặc biến hệ thống) ───
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';

// ─── Gemini AI ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

async function analyzeWithGemini(cvText, jobLabel) {
  if (!GEMINI_API_KEY) {
    console.error('[Gemini] Missing GEMINI_API_KEY');
    return null;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const prompt = `Bạn là chuyên gia tuyển dụng. Hãy đọc nội dung CV sau và đánh giá mức độ phù hợp với vị trí "${jobLabel}" trên thang 0-100. Trả về JSON hợp lệ duy nhất theo format:\n{"score": <so tu 0 den 100>, "summary": "<nhan xet ngan gon>"}\n\nCV:\n${String(cvText || '').slice(0, 6000)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });

    const rawText = await res.text();

    if (!res.ok) {
      console.error('[Gemini] HTTP error:', res.status, rawText);
      return null;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[Gemini] Response JSON parse error:', parseErr.message, rawText);
      return null;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.error('[Gemini] Empty candidate text:', JSON.stringify(data));
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      return {
        score: parsed.score,
        summary: parsed.summary
      };
    } catch (parseErr) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[Gemini] No JSON object found in model text:', text);
        return null;
      }

      try {
        return JSON.parse(match[0]);
      } catch (fallbackErr) {
        console.error('[Gemini] Fallback JSON parse error:', fallbackErr.message, text);
        return null;
      }
    }
  } catch (error) {
    console.error('[Gemini] Network/runtime error:', error);
    return null;
  }
}

// ─── Load JOBS từ file JSON dùng chung ───
function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {
    return {
      marketing:      { label: 'Marketing Manager',    score: 78 },
      finance:        { label: 'Financial Analyst',     score: 82 },
      technology:     { label: 'Software Engineer',     score: 86 },
      humanresources: { label: 'HR Specialist',         score: 74 },
      accounting:     { label: 'Accountant',            score: 79 },
      logistics:      { label: 'Logistics Coordinator', score: 76 }
    };
  }
}

const VALID_CV_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

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

function isValidJobKey(key) {
  return Object.prototype.hasOwnProperty.call(loadJobs(), key);
}

function isValidCvFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) return false;
  return VALID_CV_EXTENSIONS.has(path.extname(fileName).toLowerCase());
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
    history: Array.isArray(safeState.history) ? safeState.history : [],
    messages: Array.isArray(safeState.messages) ? safeState.messages : []
  };
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadState() {
  const loadedState = normalizeState({ ...getDefaultState(), ...readJson(DATA_FILE, {}) });
  saveState(loadedState);
  return loadedState;
}

function saveState(state) { writeJson(DATA_FILE, normalizeState(state)); }

function getJob(key) {
  const JOBS = loadJobs();
  return JOBS[key] || JOBS.marketing;
}

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
  switch (ext) {
    case '.html': return 'text/html';
    case '.css':  return 'text/css';
    case '.js':   return 'application/javascript';
    case '.json': return 'application/json';
    case '.svg':  return 'image/svg+xml';
    case '.png':  return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.pdf':  return 'application/pdf';
    case '.ico':  return 'image/x-icon';
    default:      return 'application/octet-stream';
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!API_SECRET) return true;
  return req.headers['x-api-key'] === API_SECRET;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) saveState(getDefaultState());
}

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
  const selectedJobKey = statePatch.selectedJobKey || state.selectedJobKey || 'marketing';
  const job = getJob(selectedJobKey);
  const analysisFinishedAt = Date.now();

  let score = job.score;
  let aiSummary = null;
  let simulated = true;

  const cvText = typeof statePatch.cvText === 'string' ? statePatch.cvText.trim() : '';

  if (cvText && GEMINI_API_KEY) {
    const aiResult = await analyzeWithGemini(cvText, job.label);
    if (aiResult) {
      score = Math.min(100, Math.max(0, Number(aiResult.score) || job.score));
      aiSummary = aiResult.summary || null;
      simulated = false;
    }
  }

  const lastResult = {
    jobKey: selectedJobKey,
    score,
    jobLabel: job.label,
    fileName: statePatch.selectedFileName || state.selectedFileName || '',
    aiSummary,
    simulated
  };

  const historyEntry = {
    position: job.label,
    score: `${score}/100`,
    date: new Intl.DateTimeFormat('vi-VN').format(new Date(analysisFinishedAt))
  };

  const nextState = normalizeState({
    ...state,
    ...statePatch,
    selectedJobKey,
    analysisFinishedAt,
    lastResult,
    history: [historyEntry, ...state.history].slice(0, 10)
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
