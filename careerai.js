(function () {
  const STORAGE_KEY = 'careerai-state';
  const API_BASE = (() => {
    try {
      if (window.location && window.location.protocol.startsWith('http')) return window.location.origin;
    } catch { /* ignore */ }
    return 'http://localhost:3000';
  })();

  let JOBS_CACHE = null;

  const JOBS_FALLBACK = {
    marketing:      { label: 'Marketing Manager',     score: 78 },
    finance:        { label: 'Financial Analyst',      score: 82 },
    technology:     { label: 'Software Engineer',      score: 86 },
    humanresources: { label: 'HR Specialist',          score: 74 },
    accounting:     { label: 'Accountant',             score: 79 },
    logistics:      { label: 'Logistics Coordinator',  score: 76 }
  };

  async function fetchJobs() {
    if (JOBS_CACHE) return JOBS_CACHE;
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (!res.ok) throw new Error('jobs fetch failed');
      JOBS_CACHE = await res.json();
      return JOBS_CACHE;
    } catch {
      JOBS_CACHE = JOBS_FALLBACK;
      return JOBS_CACHE;
    }
  }

  function getDefaultState() {
    return {
      selectedJobKey: 'marketing', selectedFileName: '', cvText: '',
      lastResult: null, startedAnalysisAt: null, analysisFinishedAt: null,
      analysisLocked: false, history: [], messages: []
    };
  }

  function loadState() {
    try { return { ...getDefaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
    catch { return getDefaultState(); }
  }

  function saveState(nextState) { localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)); }

  async function hydrateStateFromServer() {
    try {
      const remoteState = await apiRequest('/api/state');
      if (remoteState) {
        const localState = loadState();
        saveState({ ...getDefaultState(), ...remoteState, cvText: localState.cvText || '' });
      }
    } catch { /* Keep local state */ }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function syncPatchToServer(patch) {
    const { cvText: _cvText, ...patchWithoutCvText } = patch;
    void apiRequest('/api/state', { method: 'PUT', body: JSON.stringify(patchWithoutCvText) }).catch(() => {});
  }

  function syncMessageToServer(message) {
    void apiRequest('/api/messages', { method: 'POST', body: JSON.stringify(message) }).catch(() => {});
  }

  async function analyzeOnServer(state) {
    return apiRequest('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ selectedJobKey: state.selectedJobKey, selectedFileName: state.selectedFileName, cvText: state.cvText || '' })
    });
  }

  function setState(patch) {
    const nextState = { ...loadState(), ...patch };
    saveState(nextState);
    syncPatchToServer(patch);
    return nextState;
  }

  async function getJobConfig(key, jobs) {
    const map = jobs || await fetchJobs();
    return map[key] || map['marketing'] || Object.values(map)[0];
  }

  function formatDate(date) { return new Intl.DateTimeFormat('vi-VN').format(date); }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(''); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được file CV'));
      reader.readAsText(file);
    });
  }

  async function initHome() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const homeJob = document.querySelector('.job-select');
    if (homeJob) homeJob.textContent = job.label;
  }

  async function initJobsPage() {
    const jobs = await fetchJobs();
    const search = document.getElementById('job-search');
    const jobCards = Array.from(document.querySelectorAll('[data-job-key]'));
    const continueButton = document.getElementById('jobs-continue');
    const state = loadState();

    function renderSelection(activeKey) {
      jobCards.forEach((card) => {
        const isActive = card.dataset.jobKey === activeKey;
        card.style.borderColor = isActive ? 'var(--orange)' : 'var(--line)';
        card.style.boxShadow = isActive ? '0 0 0 2px rgba(245,130,31,.12)' : 'none';
        card.setAttribute('aria-pressed', String(isActive));
      });
    }

    function selectJob(key) { renderSelection(setState({ selectedJobKey: key }).selectedJobKey); }

    jobCards.forEach((card) => {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => selectJob(card.dataset.jobKey));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectJob(card.dataset.jobKey); }
      });
    });

    if (search) {
      search.addEventListener('input', () => {
        const value = search.value.trim().toLowerCase();
        jobCards.forEach((card) => { card.style.display = card.textContent.toLowerCase().includes(value) ? '' : 'none'; });
      });
    }

    renderSelection(state.selectedJobKey);

    if (continueButton) {
      continueButton.addEventListener('click', (event) => {
        event.preventDefault();
        setState({ selectedJobKey: loadState().selectedJobKey || 'marketing' });
        window.location.href = 'upload.html';
      });
    }
  }

  async function initUploadPage() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const selectedJobNode = document.getElementById('selected-job-name');
    const fileLabelNode = document.getElementById('selected-file-name');
    const chooseFileButton = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('cv-file-input');
    const nextButton = document.getElementById('upload-next');
    const messageNode = document.getElementById('upload-message');

    if (selectedJobNode) selectedJobNode.textContent = job.label;
    if (fileLabelNode) fileLabelNode.textContent = state.selectedFileName ? `Tệp đã chọn: ${state.selectedFileName}` : 'Chưa chọn file CV';

    async function updateFile(file) {
      if (!file) {
        setState({ selectedFileName: '', cvText: '', analysisLocked: false });
        if (fileLabelNode) fileLabelNode.textContent = 'Chưa chọn file CV';
        if (messageNode) messageNode.textContent = 'Vui lòng chọn file CV để tiếp tục.';
        return;
      }
      if (messageNode) messageNode.textContent = 'Đang đọc nội dung CV...';
      try {
        const cvText = await readFileAsText(file);
        const nextState = setState({ selectedFileName: file.name, cvText: cvText.trim(), analysisLocked: false });
        if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
        if (messageNode) messageNode.textContent = nextState.cvText ? 'CV đã sẵn sàng để phân tích.' : 'Không đọc được nội dung CV. Hệ thống sẽ chạy mô phỏng.';
      } catch {
        setState({ selectedFileName: file.name, cvText: '', analysisLocked: false });
        if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
        if (messageNode) messageNode.textContent = 'Không đọc được nội dung file. Vẫn có thể chạy mô phỏng.';
      }
    }

    if (chooseFileButton && fileInput) {
      chooseFileButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => { await updateFile(fileInput.files && fileInput.files[0]); });
    }

    if (nextButton) {
      nextButton.addEventListener('click', async (event) => {
        event.preventDefault();
        if (!loadState().selectedFileName) { if (messageNode) messageNode.textContent = 'Hãy chọn file CV trước khi phân tích.'; return; }
        nextButton.setAttribute('aria-disabled', 'true');
        nextButton.style.pointerEvents = 'none';
        nextButton.style.opacity = '0.6';
        setState({ startedAnalysisAt: Date.now(), analysisLocked: true });
        try { window.sessionStorage.setItem('careerai-run-analysis', '1'); } catch { /* ignore */ }
        window.location.href = 'analysis.html';
      });
    }
  }

  async function initAnalysisPage() {
    let shouldRun = false;
    try { shouldRun = window.sessionStorage.getItem('careerai-run-analysis') === '1'; if (shouldRun) window.sessionStorage.removeItem('careerai-run-analysis'); } catch { shouldRun = false; }

    const nextButton = document.querySelector('.next-btn');

    if (!shouldRun) {
      const titleNode = document.querySelector('.analysis-title');
      const subtitleNode = document.querySelector('.section-sub');
      const ring = document.querySelector('.percent-ring');
      if (titleNode) titleNode.textContent = 'Bước phân tích đang chờ CV';
      if (subtitleNode) subtitleNode.textContent = 'Hãy quay lại bước tải CV để bắt đầu phân tích.';
      if (ring) ring.textContent = '0%';
      if (nextButton) { nextButton.textContent = 'Quay lại tải CV →'; nextButton.setAttribute('href', 'upload.html'); nextButton.removeAttribute('aria-disabled'); nextButton.style.pointerEvents = ''; nextButton.style.opacity = ''; }
      return;
    }

    if (nextButton) { nextButton.textContent = 'Đang phân tích...'; nextButton.removeAttribute('href'); nextButton.setAttribute('aria-disabled', 'true'); nextButton.style.pointerEvents = 'none'; nextButton.style.opacity = '0.6'; }

    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const ring = document.querySelector('.percent-ring');
    const list = document.querySelector('.analysis-list');
    let current = 12;
    if (ring) ring.textContent = '12%';
    if (list) list.innerHTML = `<div>🟠 Đọc dữ liệu CV</div><div>🟠 Đối chiếu với yêu cầu ngành</div><div class="warn">⏳ Phân tích mức độ phù hợp</div><div class="muted">⚪ Tạo kết quả đánh giá</div>`;

    const timer = window.setInterval(() => {
      current += 8;
      if (current > 100) current = 100;
      if (ring) ring.textContent = `${current}%`;
      if (current === 100) {
        window.clearInterval(timer);
        analyzeOnServer(state)
          .then((result) => {
            if (result && result.lastResult) setState({ analysisFinishedAt: result.analysisFinishedAt || Date.now(), lastResult: result.lastResult, history: result.history || [], analysisLocked: false });
            window.setTimeout(() => window.location.replace('result.html'), 650);
          })
          .catch(() => {
            setState({ analysisFinishedAt: Date.now(), lastResult: { jobKey: state.selectedJobKey, score: job.score, jobLabel: job.label, fileName: state.selectedFileName, aiSummary: null, aiRecommendations: null, aiSkills: null, simulated: true }, analysisLocked: false });
            window.setTimeout(() => window.location.replace('result.html'), 650);
          });
      }
    }, 180);
  }

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

    // Score
    if (scoreNumber) scoreNumber.textContent = String(result.score);

    // Badge AI / Mô phỏng
    if (badgeWrap) {
      badgeWrap.innerHTML = result.simulated
        ? `<div class="ai-badge sim"><span class="dot"></span>Mô phỏng — chưa kết nối AI</div>`
        : `<div class="ai-badge real"><span class="dot"></span>✅ AI đã phân tích nội dung CV</div>`;
    }

    // File tag
    if (fileTagWrap && state.selectedFileName) {
      fileTagWrap.innerHTML = `<div class="file-tag">📎 ${state.selectedFileName}</div>`;
    }

    // AI Summary
    if (summaryBox) {
      const summary = result.aiSummary || (!result.simulated ? '' : (job.description || ''));
      if (summary) {
        summaryBox.style.display = '';
        summaryBox.className = 'ai-summary-box' + (result.simulated ? ' sim' : '');
        summaryBox.textContent = summary;
      }
    }

    // Đề xuất cải thiện — ưu tiên từ AI, fallback sang jobs-data
    if (recommendList) {
      const recs = (!result.simulated && Array.isArray(result.aiRecommendations) && result.aiRecommendations.length > 0)
        ? result.aiRecommendations
        : (job.recommendations || []);

      if (recs.length > 0) {
        recommendList.innerHTML = recs.map((item) => `<li>${result.simulated ? '✅' : '🤖'} ${item}</li>`).join('');
        if (result.simulated) {
          const warn = document.createElement('li');
          warn.className = 'warn';
          warn.innerHTML = '⚠️ Chỉnh sửa CV theo mô tả công việc để tăng mức độ phù hợp';
          recommendList.appendChild(warn);
        }
      } else {
        recommendList.innerHTML = '<li class="muted">Không có đề xuất từ AI.</li>';
      }
    }

    // Skill bars — ưu tiên từ AI, fallback sang jobs-data
    if (skillsList) {
      const skills = (!result.simulated && Array.isArray(result.aiSkills) && result.aiSkills.length > 0)
        ? result.aiSkills
        : (job.skills || []);

      if (skills.length > 0) {
        skillsList.innerHTML = skills.map(([name, pct, isWeak]) => `
          <div class="skill-row-v2">
            <span class="skill-name" title="${name}">${name}</span>
            <div class="track-v2"><div class="fill-v2${isWeak ? ' orange' : ''}" style="width:${pct}%"></div></div>
            <span class="pct${isWeak ? ' low' : ''}">${pct}%</span>
          </div>
        `).join('');
      } else {
        skillsList.innerHTML = '<p class="muted" style="padding:8px 0">Không có dữ liệu kỹ năng.</p>';
      }
    }
  }

  async function initRoadmapPage() {
    if (!document.getElementById('roadmap')) return;
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const titleNode = document.querySelector('.roadmap-title');
    const subtitleNode = document.querySelector('.section-sub');
    const cards = Array.from(document.querySelectorAll('.road-card'));
    const overallNode = document.querySelector('.overall p');
    if (titleNode) titleNode.textContent = 'Lộ trình phát triển nghề nghiệp';
    if (subtitleNode) subtitleNode.textContent = `Kế hoạch 6 tháng để đạt mục tiêu ${job.label}`;
    if (job.roadmap) {
      cards.forEach((card, index) => {
        const section = job.roadmap[index];
        if (!section) return;
        const tag = card.querySelector('.tag');
        const heading = card.querySelector('h3');
        const list = card.querySelector('.road-list');
        if (tag) tag.textContent = section[0];
        if (heading) heading.textContent = section[1];
        if (list) list.innerHTML = section[2].map((item, i) => `<li><span class="sq ${index === 0 || i === 0 ? 'orange' : ''}"></span>${item}</li>`).join('');
      });
    }
    if (overallNode) overallNode.textContent = `${Math.round(job.score / 3)}% hoàn thành`;
  }

  async function initDashboardPage() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const kpis = Array.from(document.querySelectorAll('.kpi'));
    const tbody = document.querySelector('.history tbody');
    const quickLinks = document.querySelectorAll('.quick .quick-btn');
    if (kpis[0]) kpis[0].querySelector('strong').textContent = String(Math.max(1, state.history.length + (state.lastResult ? 1 : 0)));
    if (kpis[1]) kpis[1].querySelector('strong .o').textContent = String(job.score);
    if (kpis[2]) kpis[2].querySelector('strong').textContent = job.label.split(' ')[0];
    if (kpis[3]) { const c = Math.min(100, Math.max(33, Math.round((state.history.length + 1) * 18))); kpis[3].querySelector('strong').textContent = `${c}%`; kpis[3].querySelector('span').textContent = 'Lộ trình hoàn thành'; }
    const rows = [...(state.lastResult ? [{ position: state.lastResult.jobLabel, score: `${state.lastResult.score}/100`, date: formatDate(new Date(state.analysisFinishedAt || Date.now())) }] : []), ...state.history];
    if (tbody) tbody.innerHTML = rows.length ? rows.map((r) => `<tr><td>${r.position}</td><td class="score">${r.score}</td><td>${r.date}</td></tr>`).join('') : '<tr><td colspan="3">Chưa có lịch sử phân tích</td></tr>';
    if (quickLinks[0]) { quickLinks[0].textContent = 'Phân tích CV mới'; quickLinks[0].setAttribute('href', 'upload.html'); }
    if (quickLinks[1]) { quickLinks[1].textContent = 'Xem lộ trình'; quickLinks[1].setAttribute('href', 'roadmap.html'); }
    if (quickLinks[2]) { quickLinks[2].textContent = 'Tải CV mẫu'; quickLinks[2].setAttribute('href', 'sample-cv.pdf'); quickLinks[2].setAttribute('download', 'sample-cv.pdf'); }
    if (quickLinks[3]) { quickLinks[3].textContent = 'Đổi nghề nghiệp'; quickLinks[3].setAttribute('href', 'jobs.html'); }
  }

  function initContactPage() {
    const formButton = document.getElementById('send-message-btn');
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const subjectInput = document.getElementById('contact-subject');
    const contentInput = document.getElementById('contact-content');
    const feedback = document.getElementById('contact-feedback');

    function showFeedback(text, isError) {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.style.color = isError ? 'var(--orange)' : '#fff';
    }

    if (formButton) {
      formButton.addEventListener('click', (event) => {
        event.preventDefault();
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const subject = subjectInput ? subjectInput.value.trim() : '';
        const content = contentInput ? contentInput.value.trim() : '';
        if (!name || !email || !subject || !content) { showFeedback('Vui lòng điền đầy đủ thông tin trước khi gửi.', true); return; }
        const state = loadState();
        state.messages.push({ name, email, subject, content, date: new Date().toISOString() });
        saveState(state);
        syncMessageToServer({ name, email, subject, content, date: new Date().toISOString() });
        showFeedback('Đã gửi tin nhắn. Đội ngũ sẽ phản hồi sớm.', false);
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (subjectInput) subjectInput.value = '';
        if (contentInput) contentInput.value = '';
      });
    }
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
