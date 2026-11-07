/**
 * Student Session Tracker - Client Application
 * Compatible with Desktop (Windows) & Mobile browsers
 * Connects to Cloudflare Pages Functions (/api/...) with automatic local offline demo support
 */

(function () {
  'use strict';

  // ================= State =================
  const state = {
    currentView: 'dashboard', // 'dashboard' | 'students' | 'profile'
    selectedDate: getTodayLocalDateStr(),
    currentStudentId: null,
    currentStudentData: null,
    studentsList: [],
    isOfflineMode: false
  };

  // ================= DOM Elements =================
  const views = {
    dashboard: document.getElementById('viewDashboard'),
    students: document.getElementById('viewStudents'),
    profile: document.getElementById('viewProfile')
  };

  // Nav buttons
  const tabDashboard = document.getElementById('tabDashboard');
  const tabStudents = document.getElementById('tabStudents');
  const mobTabDashboard = document.getElementById('mobTabDashboard');
  const mobTabStudents = document.getElementById('mobTabStudents');
  const todayPendingCount = document.getElementById('todayPendingCount');

  // Modals & triggers
  const btnOpenAddStudent = document.getElementById('btnOpenAddStudent');
  const mobBtnAddStudent = document.getElementById('mobBtnAddStudent');
  const modalAddStudent = document.getElementById('modalAddStudent');
  const btnCloseAddStudent = document.getElementById('btnCloseAddStudent');
  const btnCancelAddStudent = document.getElementById('btnCancelAddStudent');
  const formAddStudent = document.getElementById('formAddStudent');
  const formAddError = document.getElementById('formAddError');

  // Weekend Modal
  const modalWeekend = document.getElementById('modalWeekend');
  const btnOpenWeekendModal = document.getElementById('btnOpenWeekendModal');
  const btnCloseWeekendModal = document.getElementById('btnCloseWeekendModal');
  const btnCancelWeekend = document.getElementById('btnCancelWeekend');
  const formAddWeekend = document.getElementById('formAddWeekend');
  const formWeekendError = document.getElementById('formWeekendError');
  const weekendStudentLabel = document.getElementById('weekendStudentLabel');
  const weekendStudentId = document.getElementById('weekendStudentId');
  const inputWeekendDate = document.getElementById('inputWeekendDate');

  // Dashboard Controls
  const dashboardDatePicker = document.getElementById('dashboardDatePicker');
  const dateHumanLabel = document.getElementById('dateHumanLabel');
  const dashboardDateTitle = document.getElementById('dashboardDateTitle');
  const btnPrevDay = document.getElementById('btnPrevDay');
  const btnNextDay = document.getElementById('btnNextDay');
  const btnTodayReset = document.getElementById('btnTodayReset');
  const btnRefreshDashboard = document.getElementById('btnRefreshDashboard');
  const dashboardLoading = document.getElementById('dashboardLoading');
  const dashboardEmpty = document.getElementById('dashboardEmpty');
  const dashboardCards = document.getElementById('dashboardCards');
  const dayTotal = document.getElementById('dayTotal');
  const dayPending = document.getElementById('dayPending');
  const dayTaken = document.getElementById('dayTaken');
  const dayMissed = document.getElementById('dayMissed');

  // Students Directory
  const studentSearchInput = document.getElementById('studentSearchInput');
  const studentsLoading = document.getElementById('studentsLoading');
  const studentsEmpty = document.getElementById('studentsEmpty');
  const studentsGrid = document.getElementById('studentsGrid');

  // Profile
  const btnBackToDirectory = document.getElementById('btnBackToDirectory');
  const btnDeleteStudent = document.getElementById('btnDeleteStudent');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileTime = document.getElementById('profileTime');
  const profileStart = document.getElementById('profileStart');
  const profileExam = document.getElementById('profileExam');
  const profileDaysToExam = document.getElementById('profileDaysToExam');
  const metricCompleted = document.getElementById('metricCompleted');
  const metricPending = document.getElementById('metricPending');
  const metricMissed = document.getElementById('metricMissed');
  const metricEndDate = document.getElementById('metricEndDate');
  const progressText = document.getElementById('progressText');
  const progressPercent = document.getElementById('progressPercent');
  const barTaken = document.getElementById('barTaken');
  const barMissed = document.getElementById('barMissed');
  const sessionCountBadge = document.getElementById('sessionCountBadge');
  const sessionsTimeline = document.getElementById('sessionsTimeline');
  const profileSessionsLoading = document.getElementById('profileSessionsLoading');

  const toastContainer = document.getElementById('toastContainer');

  // ================= Date Utilities =================
  function getTodayLocalDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }

  function formatDisplayDate(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr;
    const options = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString(undefined, options);
  }

  function formatDayName(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long' });
  }

  function formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1].slice(0, 2);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
    return timeStr;
  }

  function offsetDays(dateStr, numDays) {
    const d = parseLocalDate(dateStr);
    d.setUTCDate(d.getUTCDate() + numDays);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isWeekendStr(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  function isWeekdayStr(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getUTCDay();
    return day >= 1 && day <= 5;
  }

  function getNextWeekdayStr(dateStr) {
    let curr = offsetDays(dateStr, 1);
    while (!isWeekdayStr(curr)) {
      curr = offsetDays(curr, 1);
    }
    return curr;
  }

  // ================= Toast Notifications =================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';

    toast.innerHTML = `<span style="font-weight: 700;">${icon}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ================= Local Mock Fallback Store (for offline / file:// preview) =================
  const MOCK_STORAGE_KEY = 'student_session_tracker_mock_db';

  function getMockStore() {
    try {
      const data = localStorage.getItem(MOCK_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch { }

    // Seed with a starter student for initial preview
    const today = getTodayLocalDateStr();
    const mockData = {
      students: [
        {
          id: 1,
          name: "Rahul S.",
          start_date: today,
          class_time: "10:00",
          exam_date: offsetDays(today, 32),
          max_sessions: 20
        }
      ],
      sessions: []
    };

    // Generate 20 weekday sessions for initial student
    let curr = today;
    let sId = 1;
    while (mockData.sessions.length < 20) {
      if (curr >= mockData.students[0].exam_date) break;
      if (isWeekdayStr(curr)) {
        mockData.sessions.push({
          id: sId++,
          student_id: 1,
          scheduled_date: curr,
          status: mockData.sessions.length < 3 ? 'Taken' : 'Pending',
          is_weekend: 0
        });
      }
      curr = offsetDays(curr, 1);
    }

    saveMockStore(mockData);
    return mockData;
  }

  function saveMockStore(data) {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
    } catch { }
  }

  async function mockApiCall(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const store = getMockStore();
    const urlObj = new URL(url, 'http://localhost');
    const path = urlObj.pathname;

    // GET /api/dashboard
    if (path === '/api/dashboard' && method === 'GET') {
      const date = urlObj.searchParams.get('date') || getTodayLocalDateStr();
      const sessions = store.sessions
        .filter(s => s.scheduled_date === date)
        .map(s => {
          const student = store.students.find(st => st.id === s.student_id) || {};
          const allStudentSessions = store.sessions.filter(ses => ses.student_id === s.student_id);
          return {
            session_id: s.id,
            student_id: s.student_id,
            scheduled_date: s.scheduled_date,
            status: s.status,
            is_weekend: s.is_weekend,
            student_name: student.name || 'Unknown',
            class_time: student.class_time || '10:00',
            start_date: student.start_date,
            exam_date: student.exam_date,
            completed_count: allStudentSessions.filter(x => x.status === 'Taken').length,
            missed_count: allStudentSessions.filter(x => x.status === 'Missed').length,
            pending_count: allStudentSessions.filter(x => x.status === 'Pending').length,
            total_sessions: allStudentSessions.length
          };
        });

      return {
        success: true,
        date,
        summary: {
          total: sessions.length,
          pending: sessions.filter(x => x.status === 'Pending').length,
          taken: sessions.filter(x => x.status === 'Taken').length,
          missed: sessions.filter(x => x.status === 'Missed').length
        },
        sessions
      };
    }

    // GET /api/students
    if (path === '/api/students' && method === 'GET') {
      const students = store.students.map(st => {
        const studentSessions = store.sessions.filter(ses => ses.student_id === st.id);
        const dates = studentSessions.map(x => x.scheduled_date).sort();
        const pendingSessions = studentSessions.filter(x => x.status === 'Pending').sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
        return {
          id: st.id,
          name: st.name,
          start_date: st.start_date,
          class_time: st.class_time,
          exam_date: st.exam_date,
          max_sessions: st.max_sessions,
          completed_count: studentSessions.filter(x => x.status === 'Taken').length,
          missed_count: studentSessions.filter(x => x.status === 'Missed').length,
          pending_count: studentSessions.filter(x => x.status === 'Pending').length,
          total_sessions: studentSessions.length,
          expected_end_date: dates.length > 0 ? dates[dates.length - 1] : null,
          next_pending_date: pendingSessions.length > 0 ? pendingSessions[0].scheduled_date : null
        };
      });
      return { success: true, students };
    }

    // POST /api/students
    if (path === '/api/students' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const newId = store.students.length ? Math.max(...store.students.map(s => s.id)) + 1 : 1;
      const newStudent = {
        id: newId,
        name: body.name.trim(),
        start_date: body.start_date,
        class_time: body.class_time,
        exam_date: body.exam_date,
        max_sessions: 20
      };
      store.students.push(newStudent);

      let currDate = body.start_date;
      const finished = Number(body.classes_already_finished) || 0;
      let nextSessId = store.sessions.length ? Math.max(...store.sessions.map(s => s.id)) + 1 : 1;
      let count = 0;

      while (count < 20) {
        if (currDate >= body.exam_date) break;
        if (isWeekdayStr(currDate)) {
          store.sessions.push({
            id: nextSessId++,
            student_id: newId,
            scheduled_date: currDate,
            status: count < finished ? 'Taken' : 'Pending',
            is_weekend: 0
          });
          count++;
        }
        currDate = offsetDays(currDate, 1);
      }

      saveMockStore(store);
      return { success: true, student_id: newId, message: `Student created with ${count} sessions scheduled.` };
    }

    // GET /api/students/:id
    const studentMatch = path.match(/^\/api\/students\/(\d+)$/);
    if (studentMatch && method === 'GET') {
      const id = parseInt(studentMatch[1], 10);
      const student = store.students.find(s => s.id === id);
      if (!student) return { success: false, error: 'Student not found' };

      const sessions = store.sessions.filter(s => s.student_id === id).sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
      const dates = sessions.map(s => s.scheduled_date);
      const pendingDates = sessions.filter(s => s.status === 'Pending').map(s => s.scheduled_date);

      return {
        success: true,
        student,
        metrics: {
          total_sessions: sessions.length,
          max_sessions: student.max_sessions,
          completed_count: sessions.filter(s => s.status === 'Taken').length,
          missed_count: sessions.filter(s => s.status === 'Missed').length,
          pending_count: sessions.filter(s => s.status === 'Pending').length,
          expected_end_date: dates.length > 0 ? dates[dates.length - 1] : null,
          next_pending_date: pendingDates.length > 0 ? pendingDates[0] : null,
          days_until_exam: Math.round((parseLocalDate(student.exam_date) - parseLocalDate(getTodayLocalDateStr())) / (1000 * 60 * 60 * 24))
        },
        sessions
      };
    }

    // DELETE /api/students/:id
    if (studentMatch && method === 'DELETE') {
      const id = parseInt(studentMatch[1], 10);
      store.students = store.students.filter(s => s.id !== id);
      store.sessions = store.sessions.filter(s => s.student_id !== id);
      saveMockStore(store);
      return { success: true, message: 'Student deleted' };
    }

    // PATCH /api/sessions/:id
    const sessionMatch = path.match(/^\/api\/sessions\/(\d+)$/);
    if (sessionMatch && method === 'PATCH') {
      const id = parseInt(sessionMatch[1], 10);
      const session = store.sessions.find(s => s.id === id);
      if (!session) return { success: false, error: 'Session not found' };

      const body = JSON.parse(options.body || '{}');
      const student = store.students.find(s => s.id === session.student_id);

      if (body.status === 'Taken') {
        session.status = 'Taken';
        saveMockStore(store);
        return { success: true, message: `Class marked as Taken.` };
      }

      if (body.status === 'Missed') {
        session.status = 'Missed';
        // Find max pending scheduled_date
        const pendingSessions = store.sessions.filter(s => s.student_id === session.student_id && s.status === 'Pending');
        const baseDate = pendingSessions.length > 0
          ? pendingSessions.map(s => s.scheduled_date).sort().reverse()[0]
          : session.scheduled_date;

        const nextWeekday = getNextWeekdayStr(baseDate);

        if (nextWeekday < student.exam_date) {
          const newId = store.sessions.length ? Math.max(...store.sessions.map(s => s.id)) + 1 : 1;
          store.sessions.push({
            id: newId,
            student_id: session.student_id,
            scheduled_date: nextWeekday,
            status: 'Pending',
            is_weekend: 0
          });
          saveMockStore(store);
          return { success: true, status: 'Missed', rescheduled: true, message: `Marked as Missed. Added makeup class on ${nextWeekday}.` };
        } else {
          saveMockStore(store);
          return { success: true, status: 'Missed', rescheduled: false, message: `Marked as Missed. Cannot reschedule: reached exam cutoff (${student.exam_date}). Session lost.` };
        }
      }
    }

    // POST /api/sessions/weekend
    if (path === '/api/sessions/weekend' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const studentId = parseInt(body.student_id, 10);
      const date = body.date;
      const student = store.students.find(s => s.id === studentId);
      if (!student) return { success: false, error: 'Student not found' };

      // Add weekend class
      const newId = store.sessions.length ? Math.max(...store.sessions.map(s => s.id)) + 1 : 1;
      store.sessions.push({
        id: newId,
        student_id: studentId,
        scheduled_date: date,
        status: 'Taken',
        is_weekend: 1
      });

      // Remove last scheduled pending class to cap at 20
      const pending = store.sessions.filter(s => s.student_id === studentId && s.status === 'Pending');
      let removedInfo = null;
      if (pending.length > 0) {
        pending.sort((a,b) => b.scheduled_date.localeCompare(a.scheduled_date));
        const toRemove = pending[0];
        store.sessions = store.sessions.filter(s => s.id !== toRemove.id);
        removedInfo = { id: toRemove.id, scheduled_date: toRemove.scheduled_date };
      }

      saveMockStore(store);
      return {
        success: true,
        message: removedInfo
          ? `Added weekend class on ${date}. Removed last pending class on ${removedInfo.scheduled_date} to keep total capped at 20.`
          : `Added weekend class on ${date}.`
      };
    }

    return { success: false, error: 'Endpoint not matched' };
  }

  // Unified API client that automatically switches to Mock Store when running locally or on file://
  async function apiRequest(url, options = {}) {
    if (window.location.protocol === 'file:') {
      return await mockApiCall(url, options);
    }

    try {
      const res = await fetch(url, options);
      if (res.status === 404 || res.status === 502 || res.status === 503) {
        // Fallback to local mock if server functions are not deployed locally
        return await mockApiCall(url, options);
      }
      return await res.json();
    } catch {
      // Network failure (offline or local without server) -> fallback to mock
      return await mockApiCall(url, options);
    }
  }

  // ================= Routing & View Switching =================
  function switchView(viewName, studentId = null) {
    state.currentView = viewName;

    Object.keys(views).forEach(key => {
      if (views[key]) {
        views[key].style.display = (key === viewName) ? 'block' : 'none';
        views[key].classList.toggle('active', key === viewName);
      }
    });

    // Update Desktop Tabs
    tabDashboard.classList.toggle('active', viewName === 'dashboard');
    tabStudents.classList.toggle('active', viewName === 'students' || viewName === 'profile');

    // Update Mobile Bottom Nav
    mobTabDashboard.classList.toggle('active', viewName === 'dashboard');
    mobTabStudents.classList.toggle('active', viewName === 'students' || viewName === 'profile');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'dashboard') {
      loadDashboard();
    } else if (viewName === 'students') {
      loadStudents();
    } else if (viewName === 'profile') {
      if (studentId) {
        state.currentStudentId = studentId;
        loadStudentProfile(studentId);
      }
    }
  }

  // ================= View 1: Daily Dashboard =================
  async function loadDashboard() {
    dashboardLoading.style.display = 'flex';
    dashboardEmpty.style.display = 'none';
    dashboardCards.innerHTML = '';

    // Update date controls
    dashboardDatePicker.value = state.selectedDate;
    const todayStr = getTodayLocalDateStr();
    if (state.selectedDate === todayStr) {
      dateHumanLabel.textContent = 'Today';
      dashboardDateTitle.textContent = 'Today (' + formatDisplayDate(state.selectedDate) + ')';
    } else {
      dateHumanLabel.textContent = formatDayName(state.selectedDate);
      dashboardDateTitle.textContent = formatDisplayDate(state.selectedDate);
    }

    try {
      const data = await apiRequest(`/api/dashboard?date=${encodeURIComponent(state.selectedDate)}`);
      dashboardLoading.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to load dashboard data');
      }

      // Update Summary metrics
      dayTotal.textContent = data.summary?.total || 0;
      dayPending.textContent = data.summary?.pending || 0;
      dayTaken.textContent = data.summary?.taken || 0;
      dayMissed.textContent = data.summary?.missed || 0;

      // Update badge if viewing today
      if (state.selectedDate === todayStr) {
        const count = data.summary?.pending || 0;
        if (count > 0) {
          todayPendingCount.textContent = count;
          todayPendingCount.style.display = 'inline-block';
        } else {
          todayPendingCount.style.display = 'none';
        }
      }

      if (!data.sessions || data.sessions.length === 0) {
        dashboardEmpty.style.display = 'flex';
        return;
      }

      renderDashboardCards(data.sessions);

    } catch (err) {
      dashboardLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderDashboardCards(sessions) {
    dashboardCards.innerHTML = '';

    sessions.forEach(session => {
      const card = document.createElement('div');
      card.className = 'student-card';

      const isPending = session.status === 'Pending';
      const isTaken = session.status === 'Taken';
      const isMissed = session.status === 'Missed';

      const statusClass = isPending ? 'status-pending' : (isTaken ? 'status-taken' : 'status-missed');
      const formattedTime = formatTimeDisplay(session.class_time);

      card.innerHTML = `
        <div class="card-top">
          <div>
            <h3 class="card-student-name" data-student-id="${session.student_id}">${escapeHtml(session.student_name)}</h3>
            <span class="card-time-badge">⏰ ${escapeHtml(formattedTime)}</span>
          </div>
          <span class="card-status-badge ${statusClass}">${session.status}</span>
        </div>

        <div class="card-meta">
          <div class="card-meta-row">
            <span>Course Progress</span>
            <strong>${session.completed_count} / ${session.total_sessions} Completed</strong>
          </div>
          <div class="card-meta-row">
            <span>Sessions Remaining</span>
            <span>${session.pending_count} pending</span>
          </div>
          ${session.is_weekend ? '<div class="card-meta-row"><span class="tag-weekend">Weekend Session</span></div>' : ''}
        </div>

        <div class="card-actions">
          ${isPending ? `
            <button class="btn-card-action btn-card-taken" data-action="take" data-session-id="${session.session_id}">
              ✓ Taken
            </button>
            <button class="btn-card-action btn-card-missed" data-action="miss" data-session-id="${session.session_id}">
              ✕ Missed
            </button>
          ` : `
            <button class="btn-card-action btn-secondary" style="grid-column: span 2;" data-action="view-profile" data-student-id="${session.student_id}">
              View Student Profile & Calendar
            </button>
          `}
        </div>
      `;

      card.querySelector('.card-student-name').addEventListener('click', () => {
        switchView('profile', session.student_id);
      });

      const btnTake = card.querySelector('[data-action="take"]');
      if (btnTake) {
        btnTake.addEventListener('click', () => updateSessionStatus(session.session_id, 'Taken'));
      }

      const btnMiss = card.querySelector('[data-action="miss"]');
      if (btnMiss) {
        btnMiss.addEventListener('click', () => updateSessionStatus(session.session_id, 'Missed'));
      }

      const btnView = card.querySelector('[data-action="view-profile"]');
      if (btnView) {
        btnView.addEventListener('click', () => switchView('profile', session.student_id));
      }

      dashboardCards.appendChild(card);
    });
  }

  async function updateSessionStatus(sessionId, status) {
    try {
      const data = await apiRequest(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to update session');
      }

      showToast(data.message || `Session marked as ${status}`, 'success');

      if (state.currentView === 'dashboard') {
        loadDashboard();
      } else if (state.currentView === 'profile' && state.currentStudentId) {
        loadStudentProfile(state.currentStudentId);
      }

    } catch (err) {
      showToast(`Action failed: ${err.message}`, 'error');
    }
  }

  // ================= View 2: Students Directory =================
  async function loadStudents() {
    studentsLoading.style.display = 'flex';
    studentsEmpty.style.display = 'none';
    studentsGrid.innerHTML = '';

    try {
      const data = await apiRequest('/api/students');
      studentsLoading.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch students');
      }

      state.studentsList = data.students || [];
      renderStudentsList(state.studentsList);

    } catch (err) {
      studentsLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderStudentsList(students) {
    studentsGrid.innerHTML = '';

    if (!students || students.length === 0) {
      studentsEmpty.style.display = 'flex';
      return;
    }

    studentsEmpty.style.display = 'none';

    students.forEach(student => {
      const card = document.createElement('div');
      card.className = 'directory-card';

      const completed = student.completed_count || 0;
      const missed = student.missed_count || 0;
      const pending = student.pending_count || 0;
      const formattedTime = formatTimeDisplay(student.class_time);

      card.innerHTML = `
        <div class="directory-header-row">
          <div class="directory-name">${escapeHtml(student.name)}</div>
          <div class="directory-time">⏰ ${escapeHtml(formattedTime)}</div>
        </div>

        <div class="directory-stats-row">
          <span>Taken: <strong style="color: var(--success);">${completed}</strong></span>
          <span>Missed: <strong style="color: var(--danger);">${missed}</strong></span>
          <span>Left: <strong style="color: var(--primary);">${pending}</strong></span>
        </div>

        <div class="card-meta">
          <div class="card-meta-row">
            <span>Exam Date:</span>
            <strong>${formatDisplayDate(student.exam_date)}</strong>
          </div>
          <div class="card-meta-row">
            <span>Expected End:</span>
            <span>${student.expected_end_date ? formatDisplayDate(student.expected_end_date) : '--'}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        switchView('profile', student.id);
      });

      studentsGrid.appendChild(card);
    });
  }

  // Filter students by search input
  studentSearchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderStudentsList(state.studentsList);
      return;
    }
    const filtered = state.studentsList.filter(s => 
      s.name.toLowerCase().includes(q)
    );
    renderStudentsList(filtered);
  });

  // ================= View 3: Student Profile & Calendar =================
  async function loadStudentProfile(studentId) {
    profileSessionsLoading.style.display = 'flex';
    sessionsTimeline.innerHTML = '';

    try {
      const data = await apiRequest(`/api/students/${studentId}`);
      profileSessionsLoading.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch student details');
      }

      state.currentStudentData = data;
      renderProfile(data);

    } catch (err) {
      profileSessionsLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderProfile(data) {
    const student = data.student;
    const metrics = data.metrics;
    const sessions = data.sessions || [];

    // Header info
    profileName.textContent = student.name;
    profileAvatar.textContent = student.name.charAt(0).toUpperCase();
    profileTime.textContent = '⏰ ' + formatTimeDisplay(student.class_time);
    profileStart.textContent = 'Starts: ' + formatDisplayDate(student.start_date);
    profileExam.textContent = 'Exam: ' + formatDisplayDate(student.exam_date);

    if (metrics.days_until_exam !== null) {
      if (metrics.days_until_exam < 0) {
        profileDaysToExam.textContent = 'Exam Passed';
      } else if (metrics.days_until_exam === 0) {
        profileDaysToExam.textContent = 'Exam Today!';
      } else {
        profileDaysToExam.textContent = `${metrics.days_until_exam} days to exam`;
      }
    } else {
      profileDaysToExam.textContent = '';
    }

    // Metrics Cards
    metricCompleted.textContent = metrics.completed_count;
    metricPending.textContent = metrics.pending_count;
    metricMissed.textContent = metrics.missed_count;
    metricEndDate.textContent = metrics.expected_end_date ? formatDisplayDate(metrics.expected_end_date) : 'N/A';

    // Progress bar
    const totalMax = 20;
    const completedPct = Math.min(100, Math.round((metrics.completed_count / totalMax) * 100));
    const missedPct = Math.min(100 - completedPct, Math.round((metrics.missed_count / totalMax) * 100));

    progressText.textContent = `${metrics.completed_count} / ${totalMax} Sessions Completed`;
    progressPercent.textContent = `${completedPct}%`;
    barTaken.style.width = `${completedPct}%`;
    barMissed.style.width = `${missedPct}%`;

    // Schedule Timeline
    sessionCountBadge.textContent = sessions.length;
    sessionsTimeline.innerHTML = '';

    sessions.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'session-row';

      const isPending = s.status === 'Pending';
      const isTaken = s.status === 'Taken';
      const isMissed = s.status === 'Missed';
      const statusClass = isPending ? 'status-pending' : (isTaken ? 'status-taken' : 'status-missed');
      const isWeekend = !!s.is_weekend;

      row.innerHTML = `
        <div class="session-left">
          <div class="session-number-badge">#${idx + 1}</div>
          <div class="session-date-info">
            <span class="session-date-main">${formatDisplayDate(s.scheduled_date)}</span>
            <span class="session-date-day">${formatDayName(s.scheduled_date)}</span>
          </div>
          ${isWeekend ? '<span class="tag-weekend">Weekend Class</span>' : ''}
        </div>

        <div class="session-right">
          <span class="card-status-badge ${statusClass}">${s.status}</span>
          ${isPending ? `
            <button class="session-action-btn btn-mini-taken" data-action="take" title="Mark Taken">✓</button>
            <button class="session-action-btn btn-mini-missed" data-action="miss" title="Mark Missed">✕</button>
          ` : ''}
        </div>
      `;

      const btnTake = row.querySelector('[data-action="take"]');
      if (btnTake) {
        btnTake.addEventListener('click', () => updateSessionStatus(s.id, 'Taken'));
      }

      const btnMiss = row.querySelector('[data-action="miss"]');
      if (btnMiss) {
        btnMiss.addEventListener('click', () => updateSessionStatus(s.id, 'Missed'));
      }

      sessionsTimeline.appendChild(row);
    });
  }

  // Delete student handler
  btnDeleteStudent.addEventListener('click', async () => {
    if (!state.currentStudentId || !state.currentStudentData) return;
    const name = state.currentStudentData.student.name;
    const confirmDelete = confirm(`Are you sure you want to delete ${name} and all their session data?`);
    if (!confirmDelete) return;

    try {
      const data = await apiRequest(`/api/students/${state.currentStudentId}`, { method: 'DELETE' });
      if (!data.success) throw new Error(data.error || 'Failed to delete student');

      showToast(`Student ${name} deleted successfully.`, 'info');
      switchView('students');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  });

  // Export to CSV handler
  btnExportCsv?.addEventListener('click', () => {
    if (!state.currentStudentData) return;
    exportStudentCSV(state.currentStudentData);
  });

  function exportStudentCSV(data) {
    const student = data.student;
    const sessions = data.sessions || [];

    let csv = `Student Session Report\n`;
    csv += `Student Name,"${student.name}"\n`;
    csv += `Class Time,"${student.class_time}"\n`;
    csv += `Course Start Date,${student.start_date}\n`;
    csv += `Exam Date,${student.exam_date}\n`;
    csv += `Total Sessions Scheduled,${sessions.length}\n`;
    csv += `Completed (Taken),${data.metrics.completed_count}\n`;
    csv += `Missed,${data.metrics.missed_count}\n`;
    csv += `Remaining (Pending),${data.metrics.pending_count}\n\n`;
    csv += `Session #,Scheduled Date,Day,Status,Weekend Class\n`;

    sessions.forEach((s, idx) => {
      const day = formatDayName(s.scheduled_date);
      const isWk = s.is_weekend ? 'Yes' : 'No';
      csv += `${idx + 1},${s.scheduled_date},"${day}",${s.status},${isWk}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${student.name.replace(/\s+/g, '_')}_schedule.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Attendance report exported to CSV', 'success');
  }

  // ================= Add Student Modal =================
  function openAddStudentModal() {
    formAddError.style.display = 'none';
    formAddStudent.reset();

    const today = getTodayLocalDateStr();
    document.getElementById('inputStartDate').value = today;
    document.getElementById('inputExamDate').value = offsetDays(today, 35);
    document.getElementById('inputFinishedCount').value = 0;

    modalAddStudent.style.display = 'flex';
    document.getElementById('inputStudentName').focus();
  }

  function closeAddStudentModal() {
    modalAddStudent.style.display = 'none';
  }

  btnOpenAddStudent.addEventListener('click', openAddStudentModal);
  mobBtnAddStudent.addEventListener('click', openAddStudentModal);
  btnCloseAddStudent.addEventListener('click', closeAddStudentModal);
  btnCancelAddStudent.addEventListener('click', closeAddStudentModal);

  formAddStudent.addEventListener('submit', async (e) => {
    e.preventDefault();
    formAddError.style.display = 'none';

    const submitBtn = document.getElementById('btnSubmitAddStudent');
    const spinner = submitBtn.querySelector('.btn-spinner');

    const name = document.getElementById('inputStudentName').value.trim();
    const startDate = document.getElementById('inputStartDate').value;
    const classTime = document.getElementById('inputClassTime').value;
    const examDate = document.getElementById('inputExamDate').value;
    const finishedCount = parseInt(document.getElementById('inputFinishedCount').value, 10) || 0;

    if (!name || !startDate || !classTime || !examDate) {
      formAddError.textContent = 'Please fill out all required fields.';
      formAddError.style.display = 'block';
      return;
    }

    if (startDate >= examDate) {
      formAddError.textContent = 'Start date must be strictly before exam date.';
      formAddError.style.display = 'block';
      return;
    }

    try {
      submitBtn.disabled = true;
      spinner.style.display = 'inline-block';

      const data = await apiRequest('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_date: startDate,
          class_time: classTime,
          exam_date: examDate,
          classes_already_finished: finishedCount
        })
      });

      submitBtn.disabled = false;
      spinner.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to create student');
      }

      closeAddStudentModal();
      showToast(data.message || `Student ${name} enrolled with initial schedule.`, 'success');

      if (data.student_id) {
        switchView('profile', data.student_id);
      } else {
        switchView('students');
      }

    } catch (err) {
      submitBtn.disabled = false;
      spinner.style.display = 'none';
      formAddError.textContent = err.message;
      formAddError.style.display = 'block';
    }
  });

  // ================= Add Weekend Class Modal =================
  function openWeekendModal() {
    if (!state.currentStudentData) return;
    const student = state.currentStudentData.student;

    formWeekendError.style.display = 'none';
    formAddWeekend.reset();

    weekendStudentId.value = student.id;
    weekendStudentLabel.textContent = `For ${student.name} (Exam on ${formatDisplayDate(student.exam_date)})`;

    // Suggest upcoming Saturday
    const now = new Date();
    const day = now.getDay();
    const daysUntilSat = (6 - day + 7) % 7 || 7;
    const upcomingSat = offsetDays(getTodayLocalDateStr(), daysUntilSat);
    inputWeekendDate.value = upcomingSat;
    inputWeekendDate.max = offsetDays(student.exam_date, -1);

    modalWeekend.style.display = 'flex';
  }

  function closeWeekendModal() {
    modalWeekend.style.display = 'none';
  }

  btnOpenWeekendModal.addEventListener('click', openWeekendModal);
  btnCloseWeekendModal.addEventListener('click', closeWeekendModal);
  btnCancelWeekend.addEventListener('click', closeWeekendModal);

  formAddWeekend.addEventListener('submit', async (e) => {
    e.preventDefault();
    formWeekendError.style.display = 'none';

    const submitBtn = document.getElementById('btnSubmitWeekend');
    const spinner = submitBtn.querySelector('.btn-spinner');

    const sId = weekendStudentId.value;
    const dateVal = inputWeekendDate.value;

    if (!dateVal) {
      formWeekendError.textContent = 'Please choose a date.';
      formWeekendError.style.display = 'block';
      return;
    }

    if (!isWeekendStr(dateVal)) {
      formWeekendError.textContent = 'The selected date is a weekday. Weekend classes must be on Saturday or Sunday.';
      formWeekendError.style.display = 'block';
      return;
    }

    try {
      submitBtn.disabled = true;
      spinner.style.display = 'inline-block';

      const data = await apiRequest('/api/sessions/weekend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: sId,
          date: dateVal
        })
      });

      submitBtn.disabled = false;
      spinner.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to add weekend class');
      }

      closeWeekendModal();
      showToast(data.message, 'success');
      loadStudentProfile(sId);

    } catch (err) {
      submitBtn.disabled = false;
      spinner.style.display = 'none';
      formWeekendError.textContent = err.message;
      formWeekendError.style.display = 'block';
    }
  });

  // ================= Event Listeners: Navigation =================
  tabDashboard.addEventListener('click', () => switchView('dashboard'));
  tabStudents.addEventListener('click', () => switchView('students'));
  mobTabDashboard.addEventListener('click', () => switchView('dashboard'));
  mobTabStudents.addEventListener('click', () => switchView('students'));
  btnBackToDirectory.addEventListener('click', () => switchView('students'));

  // Date Navigation
  btnPrevDay.addEventListener('click', () => {
    state.selectedDate = offsetDays(state.selectedDate, -1);
    loadDashboard();
  });

  btnNextDay.addEventListener('click', () => {
    state.selectedDate = offsetDays(state.selectedDate, 1);
    loadDashboard();
  });

  btnTodayReset.addEventListener('click', () => {
    state.selectedDate = getTodayLocalDateStr();
    loadDashboard();
  });

  dashboardDatePicker.addEventListener('change', (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      loadDashboard();
    }
  });

  btnRefreshDashboard.addEventListener('click', () => {
    loadDashboard();
    showToast('Dashboard refreshed', 'info');
  });

  // Modal Backdrop Click & Escape Key
  window.addEventListener('click', (e) => {
    if (e.target === modalAddStudent) closeAddStudentModal();
    if (e.target === modalWeekend) closeWeekendModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAddStudentModal();
      closeWeekendModal();
    }
  });

  // Initial Load
  switchView('dashboard');

})();
