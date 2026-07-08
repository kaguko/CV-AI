const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'careerai-data.json');

const JOBS = {
  marketing: { label: 'Marketing Manager', score: 78 },
  finance: { label: 'Financial Analyst', score: 82 },
  technology: { label: 'Software Engineer', score: 86 },
  humanresources: { label: 'HR Specialist', score: 74 },
  accounting: { label: 'Accountant', score: 79 },
  logistics: { label: 'Logistics Coordinator', score: 76 }
};

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
  return Object.prototype.hasOwnProperty.call(JOBS, key);
}

function isValidCvFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return false;
  }

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
    ...safeState,
    selectedJobKey,
    selectedFileName,
    lastResult,
    history: Array.isArray(safeState.history) ? safeState.history : [],
    messages: Array.isArray(safeState.messages) ? safeState.messages : []
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadState() {
  const loadedState = normalizeState({ ...getDefaultState(), ...readJson(DATA_FILE, {}) });
  saveState(loadedState);
  return loadedState;
}

function saveState(state) {
  writeJson(DATA_FILE, normalizeState(state));
}

function getJob(key) {
  return JOBS[key] || JOBS.marketing;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType) {
  res.writeHead(statusCode, {
    'Content-Type': `${contentType}; charset=utf-8`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    saveState(getDefaultState());
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT_DIR, requestedPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    sendText(res, 403, 'Forbidden', 'text/plain');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      const fallbackPath = path.join(ROOT_DIR, 'index.html');
      fs.readFile(fallbackPath, (fallbackError, fallbackData) => {
        if (fallbackError) {
          sendText(res, 404, 'Not Found', 'text/plain');
          return;
        }
        sendText(res, 200, fallbackData.toString('utf8'), 'text/html');
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(data);
  });
}

function analyzeState(statePatch) {
  const state = loadState();
  const selectedJobKey = statePatch.selectedJobKey || state.selectedJobKey || 'marketing';
  const job = getJob(selectedJobKey);
  const analysisFinishedAt = Date.now();
  const lastResult = {
    jobKey: selectedJobKey,
    score: job.score,
    jobLabel: job.label,
    fileName: statePatch.selectedFileName || state.selectedFileName || ''
  };
  const historyEntry = {
    position: job.label,
    score: `${job.score}/100`,
    date: new Intl.DateTimeFormat('vi-VN').format(new Date(analysisFinishedAt))
  };

  const nextState = {
    ...state,
    ...statePatch,
    selectedJobKey,
    analysisFinishedAt,
    lastResult,
    history: [historyEntry, ...state.history].slice(0, 10)
  };

  const normalizedNextState = normalizeState(nextState);
  saveState(normalizedNextState);
  return normalizedNextState;
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/state' && req.method === 'GET') {
    sendJson(res, 200, loadState());
    return true;
  }

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
    const nextState = {
      ...state,
      messages: [...state.messages, message].slice(0, 100)
    };
    saveState(nextState);
    sendJson(res, 200, { ok: true, message });
    return true;
  }

  if (pathname === '/api/analyze' && req.method === 'POST') {
    const patch = await parseBody(req);
    const nextState = analyzeState(patch);
    sendJson(res, 200, {
      ok: true,
      lastResult: nextState.lastResult,
      analysisFinishedAt: nextState.analysisFinishedAt,
      history: nextState.history
    });
    return true;
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    sendJson(res, 200, JOBS);
    return true;
  }

  return false;
}

ensureDataFile();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) {
        sendJson(res, 404, { error: 'Not found' });
      }
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`CareerAI server running at http://localhost:${PORT}`);
});
