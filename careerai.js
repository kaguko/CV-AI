(function () {
  const STORAGE_KEY = 'careerai-state';
  const API_BASE = (() => {
    try {
      if (window.location && window.location.protocol.startsWith('http')) {
        return window.location.origin;
      }
    } catch {}
    return 'http://localhost:3000';
  })();

  let JOBS_CACHE = null;

  const JOBS_FALLBACK = {
    marketing:      { label: 'Marketing Manager' },
    finance:        { label: 'Financial Analyst' },
    technology:     { label: 'Software Engineer' },
    humanresources: { label: 'HR Specialist' },
    accounting:     { label: 'Accountant' },
    logistics:      { label: 'Logistics Coordinator' }
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
      messages: [],
      lastResult: null,
      startedAnalysisAt: null,
      analysisFinishedAt: null,
      analysisLocked: false
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
    } catch {}
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

  function formatDate(date) {
    return new Intl.DateTimeFormat('vi-VN').format(date);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
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
    const search = document.getElementById('job-search');
    const jobCards = Array.from(document.querySelectorAll('[data-job-key]'));
    const continueButton = document.getElementById('jobs-continue');
    if (!jobCards.length && !continueButton && !search) return;

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
    const selectedJobNode = document.getElementById('selected-job-name');
    const fileLabelNode = document.getElementById('selected-file-name');
    const chooseFileButton = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('cv-file-input');
    const nextButton = document.getElementById('upload-next');
    const messageNode = document.getElementById('upload-message');
    if (!selectedJobNode && !fileLabelNode && !chooseFileButton && !fileInput && !nextButton) return;

    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);

    if (selectedJobNode) selectedJobNode.textContent = job.label;
    if (fileLabelNode) {
      fileLabelNode.textContent = state.selectedFileName ? `Tệp đã chọn: ${state.selectedFileName}` : 'Chưa chọn file CV';
    }
    if (messageNode && state.selectedFileName) {
      messageNode.textContent = state.cvText
        ? 'CV đã sẵn sàng để phân tích.'
        : 'CV đã chọn nhưng chưa đọc được nội dung đầy đủ.';
    }

    async function updateFile(file) {
      if (!file) {
        const nextState = setState({ selectedFileName: '', cvText: '' });
        if (fileLabelNode) fileLabelNode.textContent = 'Chưa chọn file CV';
        if (messageNode) messageNode.textContent = 'Vui lòng chọn file CV để tiếp tục.';
        return nextState;
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
            : 'Không đọc được nội dung CV. Hệ thống có thể chạy mô phỏng.';
        }
        return nextState;
      } catch {
        const nextState = setState({
          selectedFileName: file.name,
          cvText: ''
        });

        if (fileLabelNode) fileLabelNode.textContent = `Tệp đã chọn: ${file.name}`;
        if (messageNode) messageNode.textContent = 'Không đọc được nội dung file. Bạn vẫn có thể chạy chế độ mô phỏng.';
        return nextState;
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
      nextButton.addEventListener('click', (event) => {
        event.preventDefault();
        const currentState = loadState();

        if (!currentState.selectedFileName) {
          if (messageNode) messageNode.textContent = 'Hãy chọn file CV trước khi phân tích.';
          return;
        }

        nextButton.setAttribute('aria-disabled', 'true');
        nextButton.style.pointerEvents = 'none';
        nextButton.style.opacity = '0.6';

        setState({
          startedAnalysisAt: Date.now(),
          analysisLocked: true,
          lastResult: null
        });

        try {
          window.sessionStorage.setItem('careerai-run-analysis', '1');
        } catch {}

        window.location.href = 'analysis.html';
      });
    }
  }

  async function initAnalysisPage() {
    const ring = document.querySelector('.percent-ring');
    const list = document.querySelector('.analysis-list');
    const nextButton = document.querySelector('.next-btn');
    const titleNode = document.querySelector('.analysis-title');
    const subtitleNode = document.querySelector('.section-sub');
    if (!ring && !list && !nextButton && !titleNode) return;

    let shouldRun = false;
    try {
      shouldRun = window.sessionStorage.getItem('careerai-run-analysis') === '1';
      if (shouldRun) window.sessionStorage.removeItem('careerai-run-analysis');
    } catch {
      shouldRun = false;
    }

    if (!shouldRun) {
      if (titleNode) titleNode.textContent = 'Bước phân tích đang chờ CV';
      if (subtitleNode) subtitleNode.textContent = 'Hãy quay lại bước tải CV để bắt đầu phân tích.';
      if (ring) ring.textContent = '0%';
      if (nextButton) {
        nextButton.textContent = 'Quay lại tải CV →';
        nextButton.setAttribute('href', 'upload.html');
        nextButton.removeAttribute('aria-disabled');
        nextButton.style.pointerEvents = '';
        nextButton.style.opacity = '';
      }
      return;
    }

    if (nextButton) {
      nextButton.textContent = 'Đang phân tích...';
      nextButton.setAttribute('aria-disabled', 'true');
      nextButton.removeAttribute('href');
      nextButton.style.pointerEvents = 'none';
      nextButton.style.opacity = '0.6';
    }

    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);

    const startValue = 12;
    const endValue = 100;
    let current = startValue;

    if (ring) ring.textContent = `${startValue}%`;

    if (list) {
      list.innerHTML = `
        <div>🟠 Đọc dữ liệu CV</div>
        <div>🟠 Đối chiếu với yêu cầu ngành</div>
        <div class="warn">⏳ Phân tích mức độ phù hợp</div>
        <div class="muted">⚪ Tạo kết quả đánh giá</div>
      `;
    }

    const timer = window.setInterval(() => {
      current += 8;
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
            setState({
              analysisFinishedAt: Date.now(),
              lastResult: {
                jobKey: state.selectedJobKey,
                score: null,
                jobLabel: job.label,
                fileName: state.selectedFileName,
                aiSummary: null,
                simulated: true,
                errorMessage: 'Không kết nối được server'
              },
              analysisLocked: false
            });

            window.setTimeout(() => window.location.replace('result.html'), 650);
          });
      }
    }, 180);
  }

  // ─── initResultPage: đồng bộ đúng với result.html mới ───
  async function initResultPage() {
    const noResultBlock  = document.getElementById('no-result-block');
    const resultContent  = document.getElementById('result-content');
    const jobLabelNode   = document.getElementById('result-job-label');
    const scoreNumber    = document.getElementById('score-number');
    const aiBadgeWrap    = document.getElementById('ai-badge-wrap');
    const fileTagWrap    = document.getElementById('file-tag-wrap');
    const aiSummaryBox   = document.getElementById('ai-summary-box');
    const recommendList  = document.getElementById('recommend-list');
    const skillsList     = document.getElementById('skills-list');

    // Chỉ chạy trên result.html
    if (!noResultBlock && !resultContent) return;

    const state  = loadState();
    const jobs   = await fetchJobs();
    const result = state.lastResult || null;
    const job    = await getJobConfig(result ? result.jobKey : state.selectedJobKey, jobs);

    // ── Không có kết quả ──
    if (!result || result.score === null || result.score === undefined) {
      if (noResultBlock) noResultBlock.style.display = '';
      if (resultContent) resultContent.style.display = 'none';
      if (jobLabelNode) jobLabelNode.textContent = 'Chưa có kết quả phân tích';
      return;
    }

    // ── Có kết quả ──
    if (noResultBlock) noResultBlock.style.display = 'none';
    if (resultContent) resultContent.style.display = '';

    if (jobLabelNode) jobLabelNode.textContent = `Nghề nghiệp: ${result.jobLabel || job.label}`;
    if (scoreNumber)  scoreNumber.textContent  = String(result.score);

    // Badge AI / Mô phỏng
    if (aiBadgeWrap) {
      const isReal = !result.simulated;
      aiBadgeWrap.innerHTML = isReal
        ? `<span class="ai-badge real"><span class="dot"></span>AI đã phân tích CV thực</span>`
        : `<span class="ai-badge sim"><span class="dot"></span>Mô phỏng — chưa có Gemini key hoặc cvText rỗng</span>`;
    }

    // File tag
    if (fileTagWrap && state.selectedFileName) {
      fileTagWrap.innerHTML = `<span class="file-tag">📄 ${state.selectedFileName}</span>`;
    }

    // AI Summary
    if (aiSummaryBox) {
      if (result.aiSummary) {
        aiSummaryBox.style.display = '';
        aiSummaryBox.classList.toggle('sim', Boolean(result.simulated));
        aiSummaryBox.textContent = result.aiSummary;
      } else {
        aiSummaryBox.style.display = 'none';
      }
    }

    // Recommendations — ưu tiên AI, fallback job.recommendations
    if (recommendList) {
      const recs = (result.recommendations && result.recommendations.length)
        ? result.recommendations
        : (job.recommendations || []);

      if (recs.length) {
        recommendList.innerHTML = recs.map((item) => `<li>✅ ${item}</li>`).join('');
        if (result.simulated) {
          const warn = document.createElement('li');
          warn.className = 'warn';
          warn.textContent = '⚠️ Đây là đề xuất mẫu — hãy cung cấp GEMINI_API_KEY để có kết quả phân tích thực từ CV';
          recommendList.appendChild(warn);
        }
      } else {
        recommendList.innerHTML = '<li class="muted">Không có đề xuất</li>';
      }
    }

    // Skills — ưu tiên AI skills trong lastResult, fallback job.skills
    if (skillsList) {
      const skills = (result.skills && result.skills.length)
        ? result.skills
        : (job.skills || []);

      if (skills.length) {
        skillsList.innerHTML = skills.map(([name, pct, needsWork]) => `
          <div class="skill-row-v2">
            <span class="skill-name">${name}</span>
            <div class="track-v2"><div class="fill-v2${needsWork ? ' orange' : ''}" style="width:${pct}%"></div></div>
            <span class="pct${needsWork ? ' low' : ''}">${pct}%</span>
          </div>`).join('');
      } else {
        skillsList.innerHTML = '<p class="muted">Không có dữ liệu kỹ năng</p>';
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
        if (list) {
          list.innerHTML = section[2].map((item, itemIndex) =>
            `<li><span class="sq ${index === 0 || itemIndex === 0 ? 'orange' : ''}"></span>${item}</li>`
          ).join('');
        }
      });
    }
    if (overallNode && job.score) overallNode.textContent = `${Math.round(job.score / 3)}% hoàn thành`;
  }

  async function initDashboardPage() {
    const kpis = Array.from(document.querySelectorAll('.kpi'));
    const tbody = document.querySelector('.history tbody');
    const quickLinks = document.querySelectorAll('.quick .quick-btn');
    if (!kpis.length && !tbody && !quickLinks.length) return;

    const state = loadState();
    const jobs = await fetchJobs();
    const job = await getJobConfig(state.selectedJobKey, jobs);

    if (kpis[0]) {
      const analyzedCount = state.history.length + (state.lastResult && state.lastResult.score !== null ? 1 : 0);
      kpis[0].querySelector('strong').textContent = String(analyzedCount);
    }
    if (kpis[1]) kpis[1].querySelector('strong .o').textContent = String((state.lastResult && state.lastResult.score) || '--');
    if (kpis[2]) kpis[2].querySelector('strong').textContent = job.label.split(' ')[0];
    if (kpis[3]) {
      const completion = Math.min(100, Math.max(33, Math.round((state.history.length + 1) * 18)));
      kpis[3].querySelector('strong').textContent = `${completion}%`;
      kpis[3].querySelector('span').textContent = 'Lộ trình hoàn thành';
    }

    const rows = [
      ...(state.lastResult && state.lastResult.score !== null ? [{
        position: state.lastResult.jobLabel,
        score: `${state.lastResult.score}/100`,
        date: formatDate(new Date(state.analysisFinishedAt || Date.now()))
      }] : []),
      ...state.history
    ];

    if (tbody) {
      tbody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${row.position}</td><td class="score">${row.score}</td><td>${row.date}</td></tr>`).join('')
        : '<tr><td colspan="3">Chưa có lịch sử phân tích</td></tr>';
    }

    if (quickLinks[0]) {
      quickLinks[0].textContent = 'Phân tích CV mới';
      quickLinks[0].setAttribute('href', 'upload.html');
    }
    if (quickLinks[1]) {
      quickLinks[1].textContent = 'Xem lộ trình';
      quickLinks[1].setAttribute('href', 'roadmap.html');
    }
    if (quickLinks[2]) {
      quickLinks[2].textContent = 'Tải CV mẫu';
      quickLinks[2].setAttribute('href', 'sample-cv.pdf');
      quickLinks[2].setAttribute('download', 'sample-cv.pdf');
    }
    if (quickLinks[3]) {
      quickLinks[3].textContent = 'Đổi nghề nghiệp';
      quickLinks[3].setAttribute('href', 'jobs.html');
    }
  }

  function initContactPage() {
    const formButton = document.getElementById('send-message-btn');
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const subjectInput = document.getElementById('contact-subject');
    const contentInput = document.getElementById('contact-content');
    const feedback = document.getElementById('contact-feedback');
    if (!formButton) return;

    function showFeedback(text, isError) {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.style.color = isError ? 'var(--orange)' : '#fff';
    }

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
