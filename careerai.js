(function () {
  // ─── Storage với fallback (sandbox block localStorage) ───
  const _mem = {};
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return _mem[k] || null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { _mem[k] = v; } },
    remove: (k) => { try { localStorage.removeItem(k); } catch { delete _mem[k]; } }
  };
  const sess = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return _mem['_sess_' + k] || null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { _mem['_sess_' + k] = v; } },
    remove: (k) => { try { sessionStorage.removeItem(k); } catch { delete _mem['_sess_' + k]; } }
  };

  const STORAGE_KEY = 'careerai-state';
  const API_BASE = (() => {
    try { if (window.location && window.location.protocol.startsWith('http')) return window.location.origin; } catch {}
    return 'http://localhost:3000';
  })();

  // PDF.js CDN
  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let pdfJsLoaded = false;

  function loadPdfJs() {
    if (pdfJsLoaded || (window.pdfjsLib && window.pdfjsLib.getDocument)) { pdfJsLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_CDN;
      s.onload = () => {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch {}
        pdfJsLoaded = true;
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function readPdfAsText(file) {
    await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return text.trim();
  }

  async function readFileAsText(file) {
    if (!file) return '';
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      try { return await readPdfAsText(file); }
      catch (e) { console.warn('[PDF.js] Không đọc được PDF:', e); return ''; }
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được file CV'));
      reader.readAsText(file, 'utf-8');
    });
  }

  let JOBS_CACHE = null;
  const JOBS_FALLBACK = {
    marketing:      { label: 'Marketing Manager',    score: 78 },
    finance:        { label: 'Financial Analyst',     score: 82 },
    technology:     { label: 'Software Engineer',     score: 86 },
    humanresources: { label: 'HR Specialist',         score: 74 },
    accounting:     { label: 'Accountant',            score: 79 },
    logistics:      { label: 'Logistics Coordinator', score: 76 }
  };

  async function fetchJobs() {
    if (JOBS_CACHE) return JOBS_CACHE;
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (!res.ok) throw new Error('fetch failed');
      JOBS_CACHE = await res.json();
      return JOBS_CACHE;
    } catch { JOBS_CACHE = JOBS_FALLBACK; return JOBS_CACHE; }
  }

  function getDefaultState() {
    return { selectedJobKey: 'marketing', selectedFileName: '', cvText: '', lastResult: null, startedAnalysisAt: null, analysisFinishedAt: null, analysisLocked: false, history: [], messages: [] };
  }
  function loadState() {
    try { return { ...getDefaultState(), ...JSON.parse(store.get(STORAGE_KEY) || '{}') }; }
    catch { return getDefaultState(); }
  }
  function saveState(s) { store.set(STORAGE_KEY, JSON.stringify(s)); }

  async function hydrateStateFromServer() {
    try {
      const remote = await apiRequest('/api/state');
      if (remote) { const local = loadState(); saveState({ ...getDefaultState(), ...remote, cvText: local.cvText || '' }); }
    } catch {}
  }

  async function apiRequest(path, options = {}) {
    const r = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  function syncPatchToServer(patch) {
    const { cvText: _, ...p } = patch;
    void apiRequest('/api/state', { method: 'PUT', body: JSON.stringify(p) }).catch(() => {});
  }
  function syncMessageToServer(msg) { void apiRequest('/api/messages', { method: 'POST', body: JSON.stringify(msg) }).catch(() => {}); }
  async function analyzeOnServer(state) {
    return apiRequest('/api/analyze', { method: 'POST', body: JSON.stringify({ selectedJobKey: state.selectedJobKey, selectedFileName: state.selectedFileName, cvText: state.cvText || '' }) });
  }

  function setState(patch) { const s = { ...loadState(), ...patch }; saveState(s); syncPatchToServer(patch); return s; }
  async function getJobConfig(key, jobs) { const m = jobs || await fetchJobs(); return m[key] || m['marketing'] || Object.values(m)[0]; }
  function formatDate(d) { return new Intl.DateTimeFormat('vi-VN').format(d); }

  // ─── TRANG CHỦ ───
  async function initHome() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const el = document.querySelector('.job-select');
    if (el) el.textContent = job.label;
  }

  // ─── CHỌN NGHỀ ───
  async function initJobsPage() {
    const jobs = await fetchJobs();
    const search = document.getElementById('job-search');
    const jobCards = Array.from(document.querySelectorAll('[data-job-key]'));
    const continueBtn = document.getElementById('jobs-continue');
    const state = loadState();

    function renderSelection(key) {
      jobCards.forEach((c) => {
        const on = c.dataset.jobKey === key;
        c.style.borderColor = on ? 'var(--orange)' : 'var(--line)';
        c.style.boxShadow = on ? '0 0 0 2px rgba(245,130,31,.12)' : 'none';
        c.setAttribute('aria-pressed', String(on));
      });
    }
    function selectJob(key) { renderSelection(setState({ selectedJobKey: key }).selectedJobKey); }

    jobCards.forEach((c) => {
      c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0');
      c.addEventListener('click', () => selectJob(c.dataset.jobKey));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectJob(c.dataset.jobKey); } });
    });

    if (search) search.addEventListener('input', () => {
      const v = search.value.trim().toLowerCase();
      jobCards.forEach((c) => { c.style.display = c.textContent.toLowerCase().includes(v) ? '' : 'none'; });
    });

    renderSelection(state.selectedJobKey);

    if (continueBtn) continueBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setState({ selectedJobKey: loadState().selectedJobKey || 'marketing' });
      window.location.href = 'upload.html';
    });
  }

  // ─── TẢI CV ───
  async function initUploadPage() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const selectedJobNode = document.getElementById('selected-job-name');
    const fileLabelNode = document.getElementById('selected-file-name');
    const chooseBtn = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('cv-file-input');
    const nextBtn = document.getElementById('upload-next');
    const msgNode = document.getElementById('upload-message');
    const dropZone = document.querySelector('.upload-drop');

    if (selectedJobNode) selectedJobNode.textContent = job.label;
    if (fileLabelNode) fileLabelNode.textContent = state.selectedFileName ? `Tệp đã chọn: ${state.selectedFileName}` : 'Chưa chọn file CV';

    function setMsg(text, color) { if (msgNode) { msgNode.textContent = text; msgNode.style.color = color || ''; } }

    async function updateFile(file) {
      if (!file) { setState({ selectedFileName: '', cvText: '', analysisLocked: false }); if (fileLabelNode) fileLabelNode.textContent = 'Chưa chọn file CV'; setMsg('Vui lòng chọn file CV để tiếp tục.', ''); return; }
      const ext = (file.name || '').split('.').pop().toLowerCase();
      const valid = ['pdf', 'doc', 'docx', 'txt'].includes(ext);
      if (!valid) { setMsg('Chỉ hỗ trợ file .pdf, .doc, .docx, .txt', 'var(--orange)'); return; }
      setMsg('Đang đọc nội dung CV' + (ext === 'pdf' ? ' (PDF)' : '') + '...', 'var(--teal)');
      if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
      try {
        const cvText = await readFileAsText(file);
        setState({ selectedFileName: file.name, cvText: cvText.trim(), analysisLocked: false });
        if (cvText.trim().length > 50) setMsg(`✅ Đọc thành công — ${cvText.trim().split(/\s+/).length} từ. Sẵn sàng phân tích.`, 'var(--teal)');
        else setMsg('⚠️ Nội dung CV quá ngắn hoặc không đọc được. Hệ thống sẽ chạy mô phỏng.', 'var(--orange)');
      } catch {
        setState({ selectedFileName: file.name, cvText: '', analysisLocked: false });
        setMsg('Không đọc được nội dung file. Vẫn có thể chạy mô phỏng.', 'var(--orange)');
      }
    }

    if (chooseBtn && fileInput) {
      chooseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => { await updateFile(fileInput.files && fileInput.files[0]); });
    }

    // Drag & drop
    if (dropZone) {
      ['dragover', 'dragenter'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--orange)'; }));
      ['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--teal)'; }));
      dropZone.addEventListener('drop', async (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) await updateFile(f); });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!loadState().selectedFileName) { setMsg('Hãy chọn file CV trước khi phân tích.', 'var(--orange)'); return; }
        nextBtn.setAttribute('aria-disabled', 'true'); nextBtn.style.pointerEvents = 'none'; nextBtn.style.opacity = '0.6';
        setState({ startedAnalysisAt: Date.now(), analysisLocked: true });
        sess.set('careerai-run-analysis', '1');
        window.location.href = 'analysis.html';
      });
    }
  }

  // ─── PHÂN TÍCH ───
  async function initAnalysisPage() {
    let shouldRun = sess.get('careerai-run-analysis') === '1';
    if (shouldRun) sess.remove('careerai-run-analysis');
    const nextBtn = document.querySelector('.next-btn');
    const ring = document.querySelector('.percent-ring');
    const list = document.querySelector('.analysis-list');

    if (!shouldRun) {
      const titleNode = document.querySelector('.analysis-title');
      if (titleNode) titleNode.textContent = 'Bước phân tích đang chờ CV';
      if (ring) ring.textContent = '—';
      if (nextBtn) { nextBtn.textContent = 'Quay lại tải CV →'; nextBtn.setAttribute('href', 'upload.html'); nextBtn.removeAttribute('aria-disabled'); nextBtn.style.pointerEvents = ''; nextBtn.style.opacity = ''; }
      return;
    }

    if (nextBtn) { nextBtn.textContent = 'Đang phân tích...'; nextBtn.removeAttribute('href'); nextBtn.setAttribute('aria-disabled', 'true'); nextBtn.style.pointerEvents = 'none'; nextBtn.style.opacity = '0.6'; }
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);

    // Kiểm tra cvText
    const hasCvText = state.cvText && state.cvText.trim().length > 50;
    const usingAI = hasCvText;

    let current = 0;
    const steps = [
      [10, '🟠 Đọc dữ liệu CV', '🟠 Đối chiếu yêu cầu ngành', '⏳ Phân tích mức độ phù hợp', '⚪ Tạo kết quả đánh giá'],
      [35, '✅ Đọc dữ liệu CV', '🟠 Đối chiếu yêu cầu ngành', '⏳ Phân tích mức độ phù hợp', '⚪ Tạo kết quả đánh giá'],
      [60, '✅ Đọc dữ liệu CV', '✅ Đối chiếu yêu cầu ngành', '🟠 Phân tích mức độ phù hợp', '⚪ Tạo kết quả đánh giá'],
      [85, '✅ Đọc dữ liệu CV', '✅ Đối chiếu yêu cầu ngành', '✅ Phân tích mức độ phù hợp', '🟠 Tạo kết quả đánh giá'],
      [100, '✅ Đọc dữ liệu CV', '✅ Đối chiếu yêu cầu ngành', '✅ Phân tích mức độ phù hợp', '✅ Tạo kết quả đánh giá']
    ];
    let stepIdx = 0;

    if (!usingAI && list) { list.innerHTML = '<div class="warn">⚠️ Không đọc được nội dung CV — chạy mô phỏng</div>'; }

    const timer = window.setInterval(() => {
      if (stepIdx < steps.length) {
        const [pct, ...labels] = steps[stepIdx];
        current = pct; stepIdx++;
        if (ring) ring.textContent = `${current}%`;
        if (list && usingAI) list.innerHTML = labels.map((l) => `<div>${l}</div>`).join('');
      }
      if (current >= 100) {
        window.clearInterval(timer);
        analyzeOnServer(state)
          .then((result) => {
            if (result && result.lastResult) setState({ analysisFinishedAt: result.analysisFinishedAt || Date.now(), lastResult: result.lastResult, history: result.history || [], analysisLocked: false });
            window.setTimeout(() => window.location.replace('result.html'), 500);
          })
          .catch(() => {
            setState({ analysisFinishedAt: Date.now(), lastResult: { jobKey: state.selectedJobKey, score: job.score, jobLabel: job.label, fileName: state.selectedFileName, aiSummary: null, aiRecommendations: null, aiSkills: null, simulated: true }, analysisLocked: false });
            window.setTimeout(() => window.location.replace('result.html'), 500);
          });
      }
    }, 220);
  }

  // ─── KẾT QUẢ ───
  async function initResultPage() {
    if (!document.getElementById('result')) return;
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const result = state.lastResult || null;

    const jobLabelNode = document.getElementById('result-job-label');
    const noResultBlock = document.getElementById('no-result-block');
    const resultContent = document.getElementById('result-content');
    const scoreNumber = document.getElementById('score-number');
    const badgeWrap = document.getElementById('ai-badge-wrap');
    const fileTagWrap = document.getElementById('file-tag-wrap');
    const summaryBox = document.getElementById('ai-summary-box');
    const recommendList = document.getElementById('recommend-list');
    const skillsList = document.getElementById('skills-list');

    if (!result) {
      if (jobLabelNode) jobLabelNode.textContent = 'Chưa có kết quả phân tích';
      if (noResultBlock) noResultBlock.style.display = '';
      if (resultContent) resultContent.style.display = 'none';
      return;
    }

    if (jobLabelNode) jobLabelNode.textContent = `Nghề nghiệp: ${result.jobLabel}`;
    if (noResultBlock) noResultBlock.style.display = 'none';
    if (resultContent) resultContent.style.display = '';

    // Score với animation đếm số
    if (scoreNumber) {
      const target = Number(result.score) || 0;
      let cur = 0;
      const step = Math.ceil(target / 30);
      const t = setInterval(() => {
        cur = Math.min(cur + step, target);
        scoreNumber.textContent = String(cur);
        if (cur >= target) clearInterval(t);
      }, 40);
    }

    if (badgeWrap) {
      badgeWrap.innerHTML = result.simulated
        ? `<div class="sim-badge"><span></span>Mô phỏng — chưa kết nối AI</div>`
        : `<div class="sim-badge real"><span></span>✅ AI đã phân tích nội dung CV thực</div>`;
    }

    if (fileTagWrap && result.fileName) {
      fileTagWrap.innerHTML = `<div style="display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:999px;background:#f0f0f0;color:#444;font-size:14px">📎 ${result.fileName}</div>`;
    }

    if (summaryBox) {
      const summary = result.aiSummary || (!result.simulated ? '' : (job.description || ''));
      if (summary) { summaryBox.style.display = ''; summaryBox.textContent = summary; }
      else { summaryBox.style.display = 'none'; }
    }

    if (recommendList) {
      const recs = (!result.simulated && Array.isArray(result.aiRecommendations) && result.aiRecommendations.length)
        ? result.aiRecommendations : (job.recommendations || []);
      if (recs.length) {
        recommendList.innerHTML = recs.map((item) => `<li>${result.simulated ? '•' : '🤖'} ${item}</li>`).join('');
        if (result.simulated) { const w = document.createElement('li'); w.className = 'warn'; w.textContent = '⚠️ Chỉnh sửa CV theo mô tả công việc để tăng mức độ phù hợp'; recommendList.appendChild(w); }
      } else {
        recommendList.innerHTML = '<li class="muted">Không có đề xuất từ AI.</li>';
      }
    }

    if (skillsList) {
      const skills = (!result.simulated && Array.isArray(result.aiSkills) && result.aiSkills.length)
        ? result.aiSkills : (job.skills || []);
      if (skills.length) {
        skillsList.innerHTML = skills.map(([name, pct, isWeak]) => `
          <div class="skill-row">
            <span class="skill-name" title="${name}">${name}</span>
            <div class="track"><div class="fill${isWeak ? ' orange' : ''}" style="width:${pct}%"></div></div>
            <span class="pct${isWeak ? ' low' : ''}">${pct}%</span>
          </div>`).join('');
      } else {
        skillsList.innerHTML = '<p style="color:#aaa;padding:8px 0">Không có dữ liệu kỹ năng.</p>';
      }
    }
  }

  // ─── LỘ TRÌNH ───
  async function initRoadmapPage() {
    if (!document.getElementById('roadmap')) return;
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const cards = Array.from(document.querySelectorAll('.road-card'));
    const overallNode = document.querySelector('.overall p');
    const subtitleNode = document.querySelector('.section-sub');
    if (subtitleNode) subtitleNode.textContent = `Kế hoạch 6 tháng để đạt mục tiêu ${job.label}`;
    if (job.roadmap) {
      cards.forEach((card, i) => {
        const s = job.roadmap[i]; if (!s) return;
        const tag = card.querySelector('.tag'); const heading = card.querySelector('h3'); const list = card.querySelector('.road-list');
        if (tag) tag.textContent = s[0];
        if (heading) heading.textContent = s[1];
        if (list) list.innerHTML = s[2].map((item, j) => `<li><span class="sq ${i === 0 || j === 0 ? 'orange' : ''}"></span>${item}</li>`).join('');
      });
    }
    if (overallNode && state.lastResult) overallNode.textContent = `${state.lastResult.score}% hoàn thành — tiếp tục cải thiện để đạt 100%`;
  }

  // ─── DASHBOARD ───
  async function initDashboardPage() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const kpis = Array.from(document.querySelectorAll('.kpi'));
    const tbody = document.querySelector('.history tbody');
    const quickLinks = document.querySelectorAll('.quick .quick-btn');
    const totalScans = Math.max(1, state.history.length + (state.lastResult ? 1 : 0));
    if (kpis[0]) kpis[0].querySelector('strong').textContent = String(totalScans);
    if (kpis[1] && state.lastResult) { const el = kpis[1].querySelector('strong'); if (el) { el.innerHTML = `<span class="o">${state.lastResult.score}</span>/100`; } }
    if (kpis[2]) { const el = kpis[2].querySelector('strong'); if (el) el.textContent = job.label.split(' ')[0]; }
    if (kpis[3]) { const c = Math.min(100, Math.max(20, Math.round(totalScans * 20))); const el = kpis[3].querySelector('strong'); if (el) el.textContent = `${c}%`; }
    const rows = [...(state.lastResult ? [{ position: state.lastResult.jobLabel, score: `${state.lastResult.score}/100`, date: formatDate(new Date(state.analysisFinishedAt || Date.now())) }] : []), ...state.history];
    if (tbody) tbody.innerHTML = rows.length ? rows.map((r) => `<tr><td>${r.position}</td><td class="score">${r.score}</td><td>${r.date}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:#aaa">Chưa có lịch sử phân tích</td></tr>';
    if (quickLinks[0]) { quickLinks[0].textContent = 'Phân tích CV mới'; quickLinks[0].setAttribute('href', 'upload.html'); }
    if (quickLinks[1]) { quickLinks[1].textContent = 'Xem lộ trình'; quickLinks[1].setAttribute('href', 'roadmap.html'); }
    if (quickLinks[2]) { quickLinks[2].textContent = 'Tải CV mẫu'; quickLinks[2].setAttribute('href', 'sample-cv.pdf'); quickLinks[2].setAttribute('download', 'sample-cv.pdf'); }
    if (quickLinks[3]) { quickLinks[3].textContent = 'Đổi nghề nghiệp'; quickLinks[3].setAttribute('href', 'jobs.html'); }
  }

  // ─── LIÊN HỆ ───
  function initContactPage() {
    const btn = document.getElementById('send-message-btn');
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const subjectInput = document.getElementById('contact-subject');
    const contentInput = document.getElementById('contact-content');
    const feedback = document.getElementById('contact-feedback');
    function showFeedback(t, isErr) { if (feedback) { feedback.textContent = t; feedback.style.color = isErr ? 'var(--orange)' : '#fff'; } }
    if (btn) btn.addEventListener('click', (e) => {
      e.preventDefault();
      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const subject = subjectInput ? subjectInput.value.trim() : '';
      const content = contentInput ? contentInput.value.trim() : '';
      if (!name || !email || !subject || !content) { showFeedback('Vui lòng điền đầy đủ thông tin trước khi gửi.', true); return; }
      const msg = { name, email, subject, content, date: new Date().toISOString() };
      const s = loadState(); s.messages.push(msg); saveState(s); syncMessageToServer(msg);
      showFeedback('Đã gửi tin nhắn. Đội ngũ sẽ phản hồi sớm.', false);
      if (nameInput) nameInput.value = ''; if (emailInput) emailInput.value = ''; if (subjectInput) subjectInput.value = ''; if (contentInput) contentInput.value = '';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await hydrateStateFromServer();
    await fetchJobs();
    initHome();
    initJobsPage();
    initUploadPage();
    initAnalysisPage();
    initResultPage();
    initRoadmapPage();
    initDashboardPage();
    initContactPage();
  });
})();
