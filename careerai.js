(function () {
  const STORAGE_KEY = 'careerai-state';
  const API_BASE = (() => {
    try {
      if (window.location && window.location.protocol.startsWith('http')) {
        return window.location.origin;
      }
    } catch {
      // ignore
    }
    return 'http://localhost:3000';
  })();

  // Cache JOBS sau khi fetch từ server — không hardcode nữa
  let JOBS_CACHE = null;

  // Fallback tối thiểu nếu server không trả lời
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
      selectedJobKey: 'marketing',
      selectedFileName: '',
      cvText: '',
      history: [],
      messages: []
    };
  }

  function loadState() {
    try {
      return { ...getDefaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return getDefaultState();
    }
  }

  function saveState(nextState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  async function hydrateStateFromServer() {
    try {
      const remoteState = await apiRequest('/api/state');
      if (remoteState) {
        saveState({ ...getDefaultState(), ...remoteState });
      }
    } catch {
      // Keep using local storage when the API is unavailable.
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function syncPatchToServer(patch) {
    void apiRequest('/api/state', {
      method: 'PUT',
      body: JSON.stringify(patch)
    }).catch(() => {});
  }

  function syncMessageToServer(message) {
    void apiRequest('/api/messages', {
      method: 'POST',
      body: JSON.stringify(message)
    }).catch(() => {});
  }

  async function analyzeOnServer(state) {
    return apiRequest('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        selectedJobKey: state.selectedJobKey,
        selectedFileName: state.selectedFileName,
        cvText: state.cvText || ''
      })
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

  function getCurrentJobKey() {
    return loadState().selectedJobKey || 'marketing';
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('vi-VN').format(date);
  }

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
    if (homeJob) {
      homeJob.textContent = job.label;
    }
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

    function selectJob(key) {
      const nextState = setState({ selectedJobKey: key });
      renderSelection(nextState.selectedJobKey);
    }

    jobCards.forEach((card) => {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => selectJob(card.dataset.jobKey));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectJob(card.dataset.jobKey);
        }
      });
    });

    if (search) {
      search.addEventListener('input', () => {
        const value = search.value.trim().toLowerCase();
        jobCards.forEach((card) => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(value) ? '' : 'none';
        });
      });
    }

    renderSelection(state.selectedJobKey);

    if (continueButton) {
      continueButton.addEventListener('click', (event) => {
        event.preventDefault();
        const selectedKey = loadState().selectedJobKey || 'marketing';
        setState({ selectedJobKey: selectedKey });
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
    if (fileLabelNode) {
      fileLabelNode.textContent = state.selectedFileName ? `Tệp đã chọn: ${state.selectedFileName}` : 'Chưa chọn file CV';
    }

    async function updateFile(file) {
      if (!file) {
        setState({ selectedFileName: '', cvText: '' });
        if (fileLabelNode) fileLabelNode.textContent = 'Chưa chọn file CV';
        if (messageNode) messageNode.textContent = 'Vui lòng chọn file CV để tiếp tục.';
        return;
      }
      if (messageNode) messageNode.textContent = 'Đang đọc nội dung CV...';
      try {
        const cvText = await readFileAsText(file);
        const nextState = setState({
          selectedFileName: file.name,
          cvText: cvText.trim()
        });
        if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
        if (messageNode) {
          messageNode.textContent = nextState.cvText
            ? 'CV đã sẵn sàng để phân tích.'
            : 'Không đọc được nội dung CV. Hệ thống sẽ chạy mô phỏng.';
        }
      } catch {
        setState({ selectedFileName: file.name, cvText: '' });
        if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
        if (messageNode) messageNode.textContent = 'Không đọc được nội dung file. Vẫn có thể chạy mô phỏng.';
      }
    }

    if (chooseFileButton && fileInput) {
      chooseFileButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        await updateFile(file);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const currentState = loadState();
        if (!currentState.selectedFileName) {
          if (messageNode) messageNode.textContent = 'Hãy chọn file CV trước khi phân tích.';
          return;
        }
        nextButton.style.pointerEvents = 'none';
        nextButton.style.opacity = '0.6';
        setState({ startedAnalysisAt: Date.now(), analysisLocked: true });
        try {
          window.sessionStorage.setItem('careerai-run-analysis', '1');
        } catch {
          // ignore
        }
        window.location.href = 'analysis.html';
      });
    }
  }

  async function initAnalysisPage() {
    let shouldRun = false;
    try {
      shouldRun = window.sessionStorage.getItem('careerai-run-analysis') === '1';
      if (shouldRun) window.sessionStorage.removeItem('careerai-run-analysis');
    } catch {
      shouldRun = false;
    }

    const nextButton = document.querySelector('.next-btn');

    if (!shouldRun) {
      const titleNode = document.querySelector('.analysis-title');
      const subtitleNode = document.querySelector('.section-sub');
      const ring = document.querySelector('.percent-ring');
      if (titleNode) titleNode.textContent = 'Bước phân tích đang chờ CV';
      if (subtitleNode) subtitleNode.textContent = 'Hãy quay lại bước tải CV để bắt đầu phân tích.';
      if (ring) ring.textContent = '0%';
      if (nextButton) { nextButton.textContent = 'Quay lại tải CV →'; nextButton.setAttribute('href', 'upload.html'); }
      return;
    }

    // Khoá nút khi đang chạy phân tích
    if (nextButton) {
      nextButton.style.pointerEvents = 'none';
      nextButton.style.opacity = '0.6';
    }

    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const ring = document.querySelector('.percent-ring');
    const list = document.querySelector('.analysis-list');
    const startValue = 67;
    const endValue = 100;
    let current = startValue;

    if (list) {
      list.innerHTML = `
        <div>🟠 Kiểm tra kỹ năng chuyên môn</div>
        <div>🟠 Đối chiếu với yêu cầu ngành</div>
        <div class="warn">⏳ Phân tích kinh nghiệm làm việc</div>
        <div class="muted">⚪ Đánh giá độ phù hợp</div>
      `;
    }

    const timer = window.setInterval(() => {
      current += 6;
      if (current > endValue) current = endValue;
      if (ring) ring.textContent = `${current}%`;
      if (current === endValue) {
        window.clearInterval(timer);
        analyzeOnServer(state)
          .then((result) => {
            if (result && result.lastResult) {
              setState({
                analysisFinishedAt: result.analysisFinishedAt || Date.now(),
                lastResult: result.lastResult,
                history: result.history || [],
                analysisLocked: false
              });
            }
            window.setTimeout(() => window.location.replace('result.html'), 650);
          })
          .catch(() => {
            const fallbackResult = {
              jobKey: state.selectedJobKey,
              score: job.score,
              jobLabel: job.label,
              fileName: state.selectedFileName,
              simulated: true
            };
            setState({ analysisFinishedAt: Date.now(), lastResult: fallbackResult, analysisLocked: false });
            window.setTimeout(() => window.location.replace('result.html'), 650);
          });
      }
    }, 180);
  }

  async function initResultPage() {
    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);
    const result = state.lastResult || { score: job.score, jobLabel: job.label, simulated: true };
    const jobLabelNode = document.querySelector('.result-sub');
    const scoreNode = document.querySelector('.score-big .accent');
    const descriptionNode = document.querySelector('.score-desc');
    const recommendationList = document.querySelector('.improve-card ul');
    const skillRows = Array.from(document.querySelectorAll('.skills-card .skill-row'));
    const nextLinks = document.querySelectorAll('.next-card .action');

    if (jobLabelNode) jobLabelNode.textContent = `Nghề nghiệp: ${result.jobLabel}`;
    if (scoreNode) scoreNode.textContent = String(result.score);
    if (descriptionNode) {
      const desc = (result.aiSummary) ? result.aiSummary : (job.description || '');
      const badge = result.simulated
        ? '<div class="sim-badge">⚠️ Mô phỏng: chưa có Gemini AI key</div>'
        : '';
      descriptionNode.innerHTML = `${badge}${desc}<br>Tệp CV: ${state.selectedFileName || 'Chưa có tệp'}`;
    }
    if (recommendationList && job.recommendations) {
      recommendationList.innerHTML = job.recommendations.map((item) => `<li>✅ ${item}</li>`).join('');
      const warning = document.createElement('li');
      warning.className = 'warn';
      warning.textContent = '⚠️ Chỉnh sửa CV theo mô tả công việc để tăng mức độ phù hợp';
      recommendationList.appendChild(warning);
    }
    if (skillRows.length && job.skills) {
      job.skills.forEach((skill, index) => {
        const row = skillRows[index];
        if (!row) return;
        const label = row.querySelector('span');
        const bar = row.querySelector('.fill');
        if (label) label.textContent = skill[0];
        if (bar) { bar.style.width = `${skill[1]}%`; bar.classList.toggle('orange', Boolean(skill[2])); }
      });
    }
    if (nextLinks && nextLinks[0]) {
      nextLinks[0].textContent = 'Xem lộ trình chi tiết';
      if (nextLinks[1]) nextLinks[1].textContent = 'Tới dashboard';
      if (nextLinks[2]) nextLinks[2].textContent = 'Phân tích lại với CV khác';
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
        if (list) {
          list.innerHTML = section[2].map((item, itemIndex) =>
            `<li><span class="sq ${index === 0 || itemIndex === 0 ? 'orange' : ''}"></span>${item}</li>`
          ).join('');
        }
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

    if (kpis[0]) {
      const analyzedCount = Math.max(1, state.history.length + (state.lastResult ? 1 : 0));
      kpis[0].querySelector('strong').textContent = String(analyzedCount);
    }
    if (kpis[1]) kpis[1].querySelector('strong .o').textContent = String(job.score);
    if (kpis[2]) kpis[2].querySelector('strong').textContent = job.label.split(' ')[0];
    if (kpis[3]) {
      const completion = Math.min(100, Math.max(33, Math.round((state.history.length + 1) * 18)));
      kpis[3].querySelector('strong').textContent = `${completion}%`;
      kpis[3].querySelector('span').textContent = 'Lộ trình hoàn thành';
    }

    const rows = [
      ...(state.lastResult ? [{ position: state.lastResult.jobLabel, score: `${state.lastResult.score}/100`, date: formatDate(new Date(state.analysisFinishedAt || Date.now())) }] : []),
      ...state.history
    ];

    if (tbody) {
      tbody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${row.position}</td><td class="score">${row.score}</td><td>${row.date}</td></tr>`).join('')
        : '<tr><td colspan="3">Chưa có lịch sử phân tích</td></tr>';
    }

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

        if (!name || !email || !subject || !content) {
          showFeedback('Vui lòng điền đầy đủ thông tin trước khi gửi.', true);
          return;
        }

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
    await fetchJobs(); // Pre-load jobs vào cache
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
