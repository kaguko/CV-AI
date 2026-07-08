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
  const JOBS = {
    marketing: {
      label: 'Marketing Manager',
      score: 78,
      description: 'CV của bạn khá phù hợp với vị trí Marketing Manager. Nên bổ sung thêm kỹ năng digital marketing và các chỉ số đo lường hiệu quả.',
      recommendations: [
        'Bổ sung chứng chỉ Google Ads và Facebook Blueprint',
        'Thêm kinh nghiệm quản lý chiến dịch quảng cáo',
        'Nhấn mạnh kỹ năng phân tích dữ liệu (Google Analytics)',
        'Cải thiện phần mô tả thành tích bằng số liệu cụ thể'
      ],
      skills: [
        ['Content Marketing', 85, false],
        ['SEO/SEM', 60, false],
        ['Data Analytics', 40, true],
        ['Team Leadership', 75, false],
        ['Digital Ads', 30, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', [
          'Học Google Ads Certification',
          'Hoàn thành khóa Facebook Blueprint',
          'Đọc 5 case study marketing'
        ]],
        ['Tháng 3-4', 'Thực hành', [
          'Chạy 2 chiến dịch quảng cáo thử',
          'Thực tập tại agency/startup',
          'Xây portfolio digital marketing'
        ]],
        ['Tháng 5-6', 'Nâng cao', [
          'Học Google Analytics nâng cao',
          'Quản lý chiến dịch thực tế',
          'Cập nhật CV với thành tích mới'
        ]]
      ]
    },
    finance: {
      label: 'Financial Analyst',
      score: 82,
      description: 'CV của bạn phù hợp với vị trí phân tích tài chính. Hãy làm nổi bật khả năng Excel, báo cáo và tư duy số liệu.',
      recommendations: [
        'Nêu rõ kỹ năng Excel/Power BI',
        'Thêm kinh nghiệm phân tích báo cáo tài chính',
        'Bổ sung chứng chỉ CFA/FRM nếu có',
        'Nhấn mạnh khả năng làm việc với dữ liệu lớn'
      ],
      skills: [
        ['Excel Modeling', 88, false],
        ['Financial Analysis', 76, false],
        ['Power BI', 58, false],
        ['Reporting', 83, false],
        ['Risk Assessment', 51, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', ['Ôn Excel nâng cao', 'Học chuẩn báo cáo tài chính', 'Làm quen Power BI']],
        ['Tháng 3-4', 'Thực hành', ['Phân tích case study doanh nghiệp', 'Làm dự án mô phỏng', 'Thực tập phòng tài chính']],
        ['Tháng 5-6', 'Nâng cao', ['Chuẩn bị CFA Level 1', 'Tối ưu CV theo KPI', 'Xây portfolio phân tích']] 
      ]
    },
    technology: {
      label: 'Software Engineer',
      score: 86,
      description: 'CV của bạn có nền tảng kỹ thuật tốt. Nên làm rõ dự án thực tế, công nghệ đã dùng và đóng góp đo được.',
      recommendations: [
        'Thêm link GitHub/portfolio',
        'Nêu rõ stack công nghệ và vai trò trong dự án',
        'Bổ sung kinh nghiệm làm việc nhóm với Agile/Scrum',
        'Mô tả kết quả bằng số liệu: tốc độ, quy mô, người dùng'
      ],
      skills: [
        ['JavaScript', 84, false],
        ['React', 81, false],
        ['API Design', 72, false],
        ['Testing', 57, false],
        ['System Design', 49, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', ['Ôn cấu trúc dữ liệu', 'Luyện JavaScript/TypeScript', 'Xây 1 project nhỏ']],
        ['Tháng 3-4', 'Thực hành', ['Làm 2 dự án thực tế', 'Đóng góp GitHub', 'Thực tập frontend/backend']],
        ['Tháng 5-6', 'Nâng cao', ['Tối ưu portfolio', 'Ôn system design', 'Chuẩn bị phỏng vấn kỹ thuật']]
      ]
    },
    humanresources: {
      label: 'HR Specialist',
      score: 74,
      description: 'CV khá phù hợp với lĩnh vực nhân sự. Cần thể hiện thêm kỹ năng tuyển dụng, phỏng vấn và quản lý quan hệ nội bộ.',
      recommendations: [
        'Nêu kinh nghiệm tuyển dụng/phỏng vấn',
        'Bổ sung kỹ năng giao tiếp và xử lý xung đột',
        'Đưa số liệu về số lượng vị trí đã hỗ trợ',
        'Thêm kinh nghiệm dùng hệ thống HRM nếu có'
      ],
      skills: [
        ['Recruitment', 71, false],
        ['Communication', 88, false],
        ['Employee Relations', 65, false],
        ['Interviewing', 60, false],
        ['HRM Tools', 44, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', ['Học quy trình tuyển dụng', 'Ôn luật lao động cơ bản', 'Rèn giao tiếp']],
        ['Tháng 3-4', 'Thực hành', ['Tham gia phỏng vấn thử', 'Thực tập phòng nhân sự', 'Làm báo cáo tuyển dụng']],
        ['Tháng 5-6', 'Nâng cao', ['Tối ưu CV HR', 'Làm case nội bộ', 'Xây kế hoạch nhân sự mẫu']]
      ]
    },
    accounting: {
      label: 'Accountant',
      score: 79,
      description: 'CV phù hợp với vị trí kế toán. Hãy nhấn mạnh tính chính xác, kinh nghiệm đối chiếu sổ sách và phần mềm kế toán.',
      recommendations: [
        'Nêu rõ kinh nghiệm đối chiếu số liệu',
        'Bổ sung phần mềm kế toán đã dùng',
        'Thêm thành tích về giảm sai sót/chậm trễ',
        'Làm nổi bật khả năng làm việc với số liệu lớn'
      ],
      skills: [
        ['Accounting Basics', 86, false],
        ['Excel', 82, false],
        ['Bookkeeping', 77, false],
        ['Audit Support', 55, false],
        ['Tax Reporting', 48, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', ['Ôn chuẩn mực kế toán', 'Học Excel nâng cao', 'Làm quen phần mềm kế toán']],
        ['Tháng 3-4', 'Thực hành', ['Làm bài tập sổ sách', 'Thực tập kế toán', 'Báo cáo thử']],
        ['Tháng 5-6', 'Nâng cao', ['Chuẩn hóa CV', 'Ôn thuế cơ bản', 'Xây case thực hành']]
      ]
    },
    logistics: {
      label: 'Logistics Coordinator',
      score: 76,
      description: 'CV phù hợp với logistics. Nên làm rõ kinh nghiệm quy trình, quản lý đơn hàng và phối hợp chuỗi cung ứng.',
      recommendations: [
        'Bổ sung kinh nghiệm về vận hành đơn hàng',
        'Nêu rõ kỹ năng làm việc với nhà cung cấp',
        'Đưa số liệu cải thiện thời gian giao nhận',
        'Thêm kỹ năng ERP/warehouse nếu có'
      ],
      skills: [
        ['Supply Chain', 79, false],
        ['Operations', 73, false],
        ['Vendor Coordination', 66, false],
        ['Planning', 62, false],
        ['ERP Tools', 46, true]
      ],
      roadmap: [
        ['Tháng 1-2', 'Nền tảng', ['Học quy trình supply chain', 'Ôn quản lý kho', 'Tìm hiểu ERP']],
        ['Tháng 3-4', 'Thực hành', ['Thực tập vận hành', 'Làm case logistics', 'Quản lý đơn hàng thử']],
        ['Tháng 5-6', 'Nâng cao', ['Hoàn thiện portfolio', 'Ôn kỹ năng đàm phán', 'Cập nhật CV thực tế']]
      ]
    }
  };

  function getDefaultState() {
    return {
      selectedJobKey: 'marketing',
      selectedFileName: '',
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
        selectedFileName: state.selectedFileName
      })
    });
  }

  function setState(patch) {
    const nextState = { ...loadState(), ...patch };
    saveState(nextState);
    syncPatchToServer(patch);
    return nextState;
  }

  function getJobConfig(key) {
    return JOBS[key] || JOBS.marketing;
  }

  function getCurrentJobKey() {
    const state = loadState();
    return state.selectedJobKey || 'marketing';
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('vi-VN').format(date);
  }

  function initHome() {
    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
    const homeJob = document.querySelector('.job-select');
    if (homeJob) {
      homeJob.textContent = job.label;
    }
  }

  function initJobsPage() {
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

  function initUploadPage() {
    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
    const selectedJobNode = document.getElementById('selected-job-name');
    const fileLabelNode = document.getElementById('selected-file-name');
    const chooseFileButton = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('cv-file-input');
    const nextButton = document.getElementById('upload-next');
    const messageNode = document.getElementById('upload-message');

    if (selectedJobNode) {
      selectedJobNode.textContent = job.label;
    }
    if (fileLabelNode) {
      fileLabelNode.textContent = state.selectedFileName ? `Tệp đã chọn: ${state.selectedFileName}` : 'Chưa chọn file CV';
    }

    function updateFileName(file) {
      const nextState = setState({ selectedFileName: file ? file.name : '' });
      if (fileLabelNode) {
        fileLabelNode.textContent = nextState.selectedFileName ? `Tệp đã chọn: ${nextState.selectedFileName}` : 'Chưa chọn file CV';
      }
      if (messageNode) {
        messageNode.textContent = nextState.selectedFileName ? 'CV đã sẵn sàng để phân tích.' : 'Vui lòng chọn file CV để tiếp tục.';
      }
    }

    if (chooseFileButton && fileInput) {
      chooseFileButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => updateFileName(fileInput.files && fileInput.files[0]));
    }

    if (nextButton) {
      nextButton.addEventListener('click', (event) => {
        event.preventDefault();
        const currentState = loadState();
        if (!currentState.selectedFileName) {
          if (messageNode) {
            messageNode.textContent = 'Hãy chọn file CV trước khi phân tích.';
          }
          return;
        }
        setState({ startedAnalysisAt: Date.now() });
        try {
          window.sessionStorage.setItem('careerai-run-analysis', '1');
        } catch {
          // Ignore session storage failures and fall back to the page state.
        }
        window.location.href = 'analysis.html';
      });
    }
  }

  function initAnalysisPage() {
    let shouldRun = false;
    try {
      shouldRun = window.sessionStorage.getItem('careerai-run-analysis') === '1';
      if (shouldRun) {
        window.sessionStorage.removeItem('careerai-run-analysis');
      }
    } catch {
      shouldRun = false;
    }
    if (!shouldRun) {
      const titleNode = document.querySelector('.analysis-title');
      const subtitleNode = document.querySelector('.section-sub');
      const ring = document.querySelector('.percent-ring');
      const nextButton = document.querySelector('.next-btn');

      if (titleNode) {
        titleNode.textContent = 'Bước phân tích đang chờ CV';
      }
      if (subtitleNode) {
        subtitleNode.textContent = 'Hãy quay lại bước tải CV để bắt đầu phân tích.';
      }
      if (ring) {
        ring.textContent = '0%';
      }
      if (nextButton) {
        nextButton.textContent = 'Quay lại tải CV →';
        nextButton.setAttribute('href', 'upload.html');
      }
      return;
    }

    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
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
      if (current > endValue) {
        current = endValue;
      }
      if (ring) {
        ring.textContent = `${current}%`;
      }
      if (current === endValue) {
        window.clearInterval(timer);
        analyzeOnServer(state)
          .then((result) => {
            if (result && result.lastResult) {
              setState({
                analysisFinishedAt: result.analysisFinishedAt || Date.now(),
                lastResult: result.lastResult,
                history: result.history || []
              });
            }
            window.setTimeout(() => {
              window.location.replace('result.html');
            }, 650);
          })
          .catch(() => {
            const fallbackResult = {
              jobKey: state.selectedJobKey,
              score: job.score,
              jobLabel: job.label,
              fileName: state.selectedFileName
            };
            setState({
              analysisFinishedAt: Date.now(),
              lastResult: fallbackResult
            });
            window.setTimeout(() => {
              window.location.replace('result.html');
            }, 650);
          });
      }
    }, 180);
  }

  function initResultPage() {
    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
    const result = state.lastResult || { score: job.score, jobLabel: job.label };
    const jobLabelNode = document.querySelector('.result-sub');
    const scoreNode = document.querySelector('.score-big .accent');
    const descriptionNode = document.querySelector('.score-desc');
    const recommendationList = document.querySelector('.improve-card ul');
    const skillRows = Array.from(document.querySelectorAll('.skills-card .skill-row'));
    const nextLinks = document.querySelectorAll('.next-card .action');

    if (jobLabelNode) {
      jobLabelNode.textContent = `Nghề nghiệp: ${result.jobLabel}`;
    }
    if (scoreNode) {
      scoreNode.textContent = String(result.score);
    }
    if (descriptionNode) {
      descriptionNode.innerHTML = `${job.description}<br>Tệp CV: ${state.selectedFileName || 'Chưa có tệp'}`;
    }
    if (recommendationList) {
      recommendationList.innerHTML = job.recommendations.map((item) => `<li>✅ ${item}</li>`).join('');
      const warning = document.createElement('li');
      warning.className = 'warn';
      warning.textContent = '⚠️ Chỉnh sửa CV theo mô tả công việc để tăng mức độ phù hợp';
      recommendationList.appendChild(warning);
    }
    if (skillRows.length) {
      job.skills.forEach((skill, index) => {
        const row = skillRows[index];
        if (!row) return;
        const label = row.querySelector('span');
        const bar = row.querySelector('.fill');
        if (label) {
          label.textContent = skill[0];
        }
        if (bar) {
          bar.style.width = `${skill[1]}%`;
          bar.classList.toggle('orange', Boolean(skill[2]));
        }
      });
    }
    if (nextLinks && nextLinks[0]) {
      nextLinks[0].textContent = 'Xem lộ trình chi tiết';
      nextLinks[1].textContent = 'Tới dashboard';
      nextLinks[2].textContent = 'Phân tích lại với CV khác';
    }
  }

  function initRoadmapPage() {
    if (!document.getElementById('roadmap')) {
      return;
    }
    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
    const titleNode = document.querySelector('.roadmap-title');
    const subtitleNode = document.querySelector('.section-sub');
    const cards = Array.from(document.querySelectorAll('.road-card'));
    const overallNode = document.querySelector('.overall p');

    if (titleNode) {
      titleNode.textContent = 'Lộ trình phát triển nghề nghiệp';
    }
    if (subtitleNode) {
      subtitleNode.textContent = `Kế hoạch 6 tháng để đạt mục tiêu ${job.label}`;
    }
    cards.forEach((card, index) => {
      const section = job.roadmap[index];
      if (!section) return;
      const tag = card.querySelector('.tag');
      const heading = card.querySelector('h3');
      const list = card.querySelector('.road-list');
      if (tag) tag.textContent = section[0];
      if (heading) heading.textContent = section[1];
      if (list) {
        list.innerHTML = section[2].map((item, itemIndex) => `<li><span class="sq ${index === 0 || itemIndex === 0 ? 'orange' : ''}"></span>${item}</li>`).join('');
      }
    });
    if (overallNode) {
      overallNode.textContent = `${Math.round(job.score / 3)}% hoàn thành`;
    }
  }

  function initDashboardPage() {
    const state = loadState();
    const job = getJobConfig(state.selectedJobKey);
    const kpis = Array.from(document.querySelectorAll('.kpi'));
    const tbody = document.querySelector('.history tbody');
    const quickLinks = document.querySelectorAll('.quick .quick-btn');

    if (kpis[0]) {
      const analyzedCount = Math.max(1, state.history.length + (state.lastResult ? 1 : 0));
      kpis[0].querySelector('strong').textContent = String(analyzedCount);
    }
    if (kpis[1]) {
      kpis[1].querySelector('strong .o').textContent = String(job.score);
    }
    if (kpis[2]) {
      kpis[2].querySelector('strong').textContent = job.label.split(' ')[0];
    }
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
      tbody.innerHTML = rows.length ? rows.map((row) => `<tr><td>${row.position}</td><td class="score">${row.score}</td><td>${row.date}</td></tr>`).join('') : '<tr><td colspan="3">Chưa có lịch sử phân tích</td></tr>';
    }

    if (quickLinks[0]) quickLinks[0].textContent = 'Phân tích CV mới';
    if (quickLinks[1]) quickLinks[1].textContent = 'Xem lộ trình';
    if (quickLinks[2]) quickLinks[2].textContent = 'Tải CV mẫu';
    if (quickLinks[3]) quickLinks[3].textContent = 'Đổi nghề nghiệp';
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
