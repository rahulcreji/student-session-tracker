/**
 * Student Session Tracker - Client Application
 * Compatible with Desktop (Windows) & Mobile browsers
 * All data is read from / written to Cloudflare D1 through the /api/... endpoints.
 */

(function () {
  'use strict';

  // ================= State =================
  const state = {
    currentView: 'dashboard', // 'dashboard' | 'schedule' | 'students' | 'profile'
    closedThrough: null,       // local date for which past unticked classes were already closed
    scheduleData: null,        // { students, sessions } for the Schedule view
    highlightStudentId: null,  // newly added student to highlight in the Schedule
    attendancePreselectStudentId: null,
    selectedDate: getTodayLocalDateStr(),
    currentStudentId: null,
    currentStudentData: null,
    studentsList: [],
    calendarMonth: null,        // 'YYYY-MM' shown in the profile calendar
    calendarSelectedDate: null  // 'YYYY-MM-DD' whose details are shown under the calendar
  };

  // ================= DOM Elements =================
  const views = {
    dashboard: document.getElementById('viewDashboard'),
    schedule: document.getElementById('viewSchedule'),
    students: document.getElementById('viewStudents'),
    profile: document.getElementById('viewProfile')
  };

  // Nav buttons
  const tabDashboard = document.getElementById('tabDashboard');
  const tabStudents = document.getElementById('tabStudents');
  const tabSchedule = document.getElementById('tabSchedule');
  const mobTabSchedule = document.getElementById('mobTabSchedule');
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
  const dashboardEmptyTitle = document.getElementById('dashboardEmptyTitle');
  const dashboardEmptyText = document.getElementById('dashboardEmptyText');
  const dashboardNext = document.getElementById('dashboardNext');
  const attendanceChecklist = document.getElementById('attendanceChecklist');
  const checklistCount = document.getElementById('checklistCount');
  const checklistHint = document.getElementById('checklistHint');
  const checklistItems = document.getElementById('checklistItems');

  // Schedule view
  const scheduleFilter = document.getElementById('scheduleFilter');
  const scheduleLoading = document.getElementById('scheduleLoading');
  const scheduleEmpty = document.getElementById('scheduleEmpty');
  const scheduleWeeks = document.getElementById('scheduleWeeks');
  const scheduleSubtext = document.getElementById('scheduleSubtext');
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

  // Profile calendar
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarDayDetail = document.getElementById('calendarDayDetail');
  const calTitle = document.getElementById('calTitle');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const calToday = document.getElementById('calToday');

  const toastContainer = document.getElementById('toastContainer');
  const connectionBanner = document.getElementById('connectionBanner');

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

  // Whole days from local "today" to dateStr (negative = in the past)
  function daysFromToday(dateStr) {
    const target = parseLocalDate(dateStr);
    const today = parseLocalDate(getTodayLocalDateStr());
    if (!target || !today) return null;
    return Math.round((target - today) / 86400000);
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

  // ================= API Client (Cloudflare Worker + D1) =================
  // Every call goes to the real backend. There is deliberately NO offline/localStorage
  // fallback: silently saving to the browser would make the teacher believe data was
  // stored in the database when it was not.
  async function apiRequest(url, options = {}) {
    if (window.location.protocol === 'file:') {
      throw new Error('Open the app through the server (npx wrangler dev, or the deployed URL) — not by double-clicking index.html.');
    }

    let res;
    try {
      res = await fetch(url, { cache: 'no-store', ...options });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection and try again.');
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON response (e.g. HTML error page)
    }

    if (!data) {
      throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`);
    }
    if (!res.ok || data.success === false) {
      const err = new Error(data.error || `Request failed (HTTP ${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Health check: confirms the Worker can talk to D1 and the tables exist.
  async function checkConnection() {
    try {
      await apiRequest('/api/health');
      connectionBanner.style.display = 'none';
    } catch (err) {
      connectionBanner.textContent = `⚠ Database connection problem: ${err.message}`;
      connectionBanner.style.display = 'block';
    }
  }

  // Disables every button/checkbox inside `container` while `task` runs (prevents double-clicks),
  // then restores each control's previous state.
  async function withButtonsDisabled(container, task) {
    const controls = container ? Array.from(container.querySelectorAll('button, input')) : [];
    const before = controls.map(c => c.disabled);
    controls.forEach(c => { c.disabled = true; });
    try {
      return await task();
    } finally {
      controls.forEach((c, i) => { c.disabled = before[i]; });
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

    const inStudents = viewName === 'students' || viewName === 'profile';
    tabDashboard.classList.toggle('active', viewName === 'dashboard');
    tabSchedule.classList.toggle('active', viewName === 'schedule');
    tabStudents.classList.toggle('active', inStudents);
    mobTabDashboard.classList.toggle('active', viewName === 'dashboard');
    mobTabSchedule.classList.toggle('active', viewName === 'schedule');
    mobTabStudents.classList.toggle('active', inStudents);

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'dashboard') {
      loadDashboard();
    } else if (viewName === 'schedule') {
      loadSchedule();
    } else if (viewName === 'students') {
      loadStudents();
    } else if (viewName === 'profile') {
      if (studentId) {
        state.currentStudentId = studentId;
        loadStudentProfile(studentId);
      }
    }
  }

  // ================= Close past days =================
  // "If the teacher didn't tick a student, the class was not taken."
  // Classes from earlier days that are still unticked become Missed on the server
  // (and get a makeup class). Runs once per day per open tab, before data is shown.
  let closeDaysPromise = null;
  function ensurePastDaysClosed() {
    const today = getTodayLocalDateStr();
    if (state.closedThrough === today) return Promise.resolve();
    if (closeDaysPromise) return closeDaysPromise;

    closeDaysPromise = apiRequest('/api/sessions/close-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today })
    })
      .then(data => {
        state.closedThrough = today;
        if (data.closed > 0) showToast(data.message, 'info');
      })
      .catch(err => showToast(`Could not update earlier days: ${err.message}`, 'error'))
      .finally(() => { closeDaysPromise = null; });
    return closeDaysPromise;
  }

  // ================= View 1: Today (attendance checklist) =================
  async function loadDashboard() {
    dashboardLoading.style.display = 'flex';
    dashboardEmpty.style.display = 'none';
    attendanceChecklist.style.display = 'none';

    dashboardDatePicker.value = state.selectedDate;
    const todayStr = getTodayLocalDateStr();
    if (state.selectedDate === todayStr) {
      dateHumanLabel.textContent = 'Today';
      dashboardDateTitle.textContent = 'Today (' + formatDisplayDate(state.selectedDate) + ')';
    } else {
      dateHumanLabel.textContent = formatDayName(state.selectedDate);
      dashboardDateTitle.textContent = formatDisplayDate(state.selectedDate);
    }

    const requestedDate = state.selectedDate;
    try {
      await ensurePastDaysClosed();
      const data = await apiRequest(`/api/dashboard?date=${encodeURIComponent(requestedDate)}`);
      if (requestedDate !== state.selectedDate) return; // teacher moved to another day meanwhile
      dashboardLoading.style.display = 'none';

      dayTotal.textContent = data.summary?.total || 0;
      dayPending.textContent = data.summary?.pending || 0;
      dayTaken.textContent = data.summary?.taken || 0;
      dayMissed.textContent = data.summary?.missed || 0;

      if (requestedDate === todayStr) {
        const count = data.summary?.pending || 0;
        todayPendingCount.textContent = count;
        todayPendingCount.style.display = count > 0 ? 'inline-block' : 'none';
      }

      const sessions = data.sessions || [];
      const candidates = data.weekend_candidates || []; // filled on Saturday/Sunday only
      if (sessions.length === 0 && candidates.length === 0) {
        dashboardEmpty.style.display = 'flex';
        showNextClassDay(requestedDate);
        return;
      }

      renderChecklist(sessions, candidates);
    } catch (err) {
      dashboardLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  // On a day without classes (weekends, holidays), show who has class next and when,
  // with a button to jump there, so the Today page is never just blank.
  async function showNextClassDay(fromDate) {
    const todayStr = getTodayLocalDateStr();
    dashboardNext.hidden = true;
    dashboardNext.innerHTML = '';
    dashboardEmptyTitle.textContent = fromDate === todayStr
      ? `No classes today (${formatDayName(fromDate)})`
      : `No classes on ${formatDisplayDate(fromDate)}`;
    dashboardEmptyText.textContent = 'Classes run Monday to Friday.';

    try {
      const data = await apiRequest('/api/schedule');
      if (state.selectedDate !== fromDate) return; // teacher moved on meanwhile

      const studentById = new Map(data.students.map(st => [st.id, st]));
      const upcoming = data.sessions.filter(s => s.scheduled_date > fromDate && s.status === 'Pending');
      if (!upcoming.length) {
        dashboardEmptyText.textContent += data.students.length
          ? ' There are no upcoming classes.'
          : ' Add a student with "+ Add Student" to get started.';
        return;
      }

      const nextDate = upcoming[0].scheduled_date; // sessions come sorted by date
      const students = upcoming
        .filter(s => s.scheduled_date === nextDate)
        .map(s => studentById.get(s.student_id))
        .filter(Boolean)
        .sort((a, b) => a.class_time.localeCompare(b.class_time) || a.name.localeCompare(b.name));

      dashboardNext.innerHTML = `
        <p class="next-title">Next classes: <strong>${escapeHtml(formatDisplayDate(nextDate))}</strong></p>
        <ul class="next-list">
          ${students.map(st => `<li><span class="next-time">${escapeHtml(formatTimeDisplay(st.class_time))}</span><span>${escapeHtml(st.name)}</span></li>`).join('')}
        </ul>
        <button type="button" class="btn btn-primary" id="btnGoNextClassDay">Go to ${escapeHtml(formatDayName(nextDate))}</button>`;
      dashboardNext.hidden = false;
      document.getElementById('btnGoNextClassDay').addEventListener('click', () => {
        state.selectedDate = nextDate;
        loadDashboard();
      });
    } catch {
      // Keep the simple "no classes" message if the lookup fails
    }
  }

  /**
   * Checklist dropdown. Tick = attended.
   *
   * Monday–Friday: lists the students who have a class that day.
   *   Untick on TODAY = not ticked yet (becomes Missed when the day is over).
   *   Untick on a PAST day = not attended (Missed, makeup added).
   *   Ticking a past Missed class gives the class back (its makeup is removed).
   *
   * Saturday/Sunday: lists every student still in their course (`candidates`) plus
   *   anyone already ticked that day. Tick = extra weekend class (their last class is
   *   removed from the end). Untick = weekend class removed, last class comes back.
   *   Not ticked = nothing happens (the weekend is not a normal class day).
   */
  function renderChecklist(sessions, candidates = []) {
    const todayStr = getTodayLocalDateStr();
    const day = state.selectedDate;
    const isFuture = day > todayStr;
    const isPast = day < todayStr;
    const weekendDay = isWeekendStr(day);
    const attended = sessions.filter(s => s.status === 'Taken').length;
    const total = sessions.length + candidates.length;

    checklistCount.textContent = `${attended} of ${total} ${weekendDay ? 'came' : 'attended'}`;
    if (isFuture) {
      checklistHint.textContent = 'This day is in the future. Students can be ticked on the day of their class.';
    } else if (weekendDay) {
      checklistHint.textContent = `${formatDayName(day)} is an extra day. Tick the students who came: each tick counts as one class, and their last class is removed from the end of the schedule. Students not ticked are not affected.`;
    } else if (isPast) {
      checklistHint.textContent = 'Past day: tick students who attended. Anyone left unticked counted as missed, and a makeup class was added at the end of their schedule.';
    } else {
      checklistHint.textContent = 'Tick each student who attended. Anyone not ticked by the end of today counts as missed, and a makeup class is added at the end of their schedule.';
    }

    // One row per student: existing classes first, then weekend candidates
    const rows = [
      ...sessions.map(s => ({ ...s, candidate: false })),
      ...candidates.map(c => ({ ...c, candidate: true, status: 'None' }))
    ].sort((a, b) => (a.class_time || '').localeCompare(b.class_time || '') || a.student_name.localeCompare(b.student_name));

    checklistItems.innerHTML = '';
    let focusRow = null;

    rows.forEach(s => {
      const checked = s.status === 'Taken';
      // Weekday view: weekend classes are shown but changed from the weekend day itself
      const disabled = isFuture || (!weekendDay && !!s.is_weekend);
      let stateClass, statusText, meta;
      if (s.candidate) {
        stateClass = isFuture ? 'ci-upcoming' : 'ci-open';
        statusText = 'Not ticked';
        meta = `${s.completed_count} of ${s.max_sessions || 20} done · ${s.pending_count} left`;
      } else {
        stateClass = s.status === 'Taken' ? 'ci-taken' : s.status === 'Missed' ? 'ci-missed' : (isFuture ? 'ci-upcoming' : 'ci-open');
        statusText = s.status === 'Taken' ? (weekendDay ? 'Came' : 'Attended')
          : s.status === 'Missed' ? 'Missed'
          : isFuture ? 'Upcoming' : 'Not ticked yet';
        meta = s.status === 'Missed' ? 'not counted' : `Class ${s.class_number} of ${s.max_sessions || 20}`;
        if (s.is_weekend) meta += ' · <span class="tag-weekend">Extra weekend class</span>';
      }

      const li = document.createElement('li');
      li.className = `checklist-item ${stateClass}`;
      li.innerHTML = `
        <label class="ci-label">
          <input type="checkbox" class="ci-check" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}
                 aria-label="${escapeHtml(s.student_name)} ${weekendDay ? 'came' : 'attended'}">
          <span class="ci-time">${escapeHtml(formatTimeDisplay(s.class_time))}</span>
          <span class="ci-name">${escapeHtml(s.student_name)}</span>
          <span class="ci-meta">${meta}</span>
        </label>
        <span class="ci-status">${statusText}</span>
        <button type="button" class="ci-cal" title="Open ${escapeHtml(s.student_name)}'s calendar" aria-label="Open ${escapeHtml(s.student_name)}'s calendar">📅</button>
      `;

      const box = li.querySelector('.ci-check');
      box.addEventListener('change', () => (weekendDay ? onWeekendToggle(s, box) : onChecklistToggle(s, box)));
      li.querySelector('.ci-cal').addEventListener('click', () => switchView('profile', s.student_id));

      if (state.attendancePreselectStudentId && String(s.student_id) === String(state.attendancePreselectStudentId)) {
        li.classList.add('is-focus');
        focusRow = li;
      }
      checklistItems.appendChild(li);
    });

    state.attendancePreselectStudentId = null;
    attendanceChecklist.style.display = 'block';
    if (focusRow) {
      attendanceChecklist.open = true;
      setTimeout(() => focusRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }

  async function onChecklistToggle(s, box) {
    const isPast = state.selectedDate < getTodayLocalDateStr();
    const target = box.checked ? 'Taken' : (isPast ? 'Missed' : 'Pending');
    const done = await updateSessionStatus(s.session_id, target, {
      container: attendanceChecklist,
      studentName: s.student_name,
      date: s.scheduled_date,
      fromStatus: s.status
    });
    if (!done) box.checked = !box.checked; // teacher cancelled the confirmation
  }

  // Saturday/Sunday: tick = add an extra class, untick = remove it again
  async function onWeekendToggle(s, box) {
    const day = state.selectedDate;
    try {
      const data = await withButtonsDisabled(attendanceChecklist, () => box.checked
        ? apiRequest('/api/sessions/weekend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: s.student_id, date: day })
          })
        : apiRequest(`/api/sessions/${s.session_id}?today=${encodeURIComponent(getTodayLocalDateStr())}`, { method: 'DELETE' })
      );
      showToast(data.message || 'Saved', 'success');
    } catch (err) {
      showToast(`Action failed: ${err.message}`, 'error');
    }
    refreshCurrentView();
  }

  function refreshCurrentView() {
    if (state.currentView === 'dashboard') {
      loadDashboard();
    } else if (state.currentView === 'schedule') {
      loadSchedule();
    } else if (state.currentView === 'profile' && state.currentStudentId) {
      loadStudentProfile(state.currentStudentId);
    }
  }

  /**
   * Only changes that MOVE DATES ask for confirmation:
   * marking a class missed (adds a makeup) or giving a missed class back (removes one).
   */
  function confirmStatusChange(status, ctx) {
    const from = ctx.fromStatus || 'Pending';
    if (status !== 'Missed' && from !== 'Missed') return true;

    const who = ctx.studentName ? `${ctx.studentName}` : 'This student';
    const when = ctx.date ? ` on ${formatDisplayDate(ctx.date)}` : '';
    if (status === 'Missed') {
      return confirm(
        `${who} did NOT attend the class${when}?\n\n` +
        'One makeup class will be added at the end of the schedule (at the usual time) if there is a free weekday before the exam.'
      );
    }
    return confirm(
      `${who} DID attend the class${when}?\n\n` +
      'The class is given back, so the extra makeup class at the end of the schedule will be removed.'
    );
  }

  /** Returns true if the request was sent, false if the teacher cancelled. */
  async function updateSessionStatus(sessionId, status, ctx = {}) {
    if (!confirmStatusChange(status, ctx)) return false;

    try {
      const data = await withButtonsDisabled(ctx.container, () =>
        apiRequest(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, today: getTodayLocalDateStr() })
        })
      );

      const lost = status === 'Missed' && data.rescheduled === false && data.exam_cutoff_reached;
      showToast(data.message || `Saved`, lost ? 'error' : 'success');
    } catch (err) {
      showToast(`Action failed: ${err.message}`, 'error');
    }

    // Always refresh so the screen matches the database (also after a 409 conflict).
    refreshCurrentView();
    return true;
  }

  // ================= View: Schedule (all students, week by week) =================
  function mondayOf(dateStr) {
    const dow = (parseLocalDate(dateStr).getUTCDay() + 6) % 7; // Mon = 0
    return offsetDays(dateStr, -dow);
  }

  function shortDay(dateStr) {
    const d = parseLocalDate(dateStr);
    return {
      weekday: d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' }),
      date: d.toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' })
    };
  }

  async function loadSchedule() {
    scheduleLoading.style.display = 'flex';
    scheduleEmpty.style.display = 'none';
    scheduleWeeks.innerHTML = '';

    try {
      await ensurePastDaysClosed();
      const data = await apiRequest('/api/schedule');
      scheduleLoading.style.display = 'none';
      state.scheduleData = data;

      // Student filter (keep the current choice if that student still exists)
      const current = scheduleFilter.value;
      scheduleFilter.innerHTML = '<option value="">All students</option>' +
        data.students.map(st => `<option value="${st.id}">${escapeHtml(st.name)} (${escapeHtml(formatTimeDisplay(st.class_time))})</option>`).join('');
      if (data.students.some(st => String(st.id) === current)) scheduleFilter.value = current;

      renderSchedule();
    } catch (err) {
      scheduleLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderSchedule() {
    const data = state.scheduleData;
    if (!data) return;
    const todayStr = getTodayLocalDateStr();
    const filterId = scheduleFilter.value;
    const studentById = new Map(data.students.map(st => [st.id, st]));

    // Class numbers (#1..#20, Missed not counted) and each student's last class
    const classNo = new Map();
    const lastClassId = new Map();
    const counters = new Map();
    data.sessions.forEach(s => {
      if (s.status === 'Missed') return;
      const n = (counters.get(s.student_id) || 0) + 1;
      counters.set(s.student_id, n);
      classNo.set(s.id, n);
      lastClassId.set(s.student_id, s.id);
    });

    const visibleStudents = data.students.filter(st => !filterId || String(st.id) === filterId);
    const visibleIds = new Set(visibleStudents.map(st => st.id));
    const visibleSessions = data.sessions.filter(s => visibleIds.has(s.student_id));

    // Only today and the future are shown; past classes live in each student's profile.
    const startWeek = mondayOf(todayStr);

    // Group classes + exam days by date
    const byDate = new Map();
    const push = (date, item) => { if (!byDate.has(date)) byDate.set(date, []); byDate.get(date).push(item); };
    visibleSessions.forEach(s => {
      if (s.scheduled_date >= todayStr) push(s.scheduled_date, { type: 'class', s, st: studentById.get(s.student_id) });
    });
    visibleStudents.forEach(st => {
      if (st.exam_date && st.exam_date >= todayStr) push(st.exam_date, { type: 'exam', st });
    });

    const shownDates = [...byDate.keys()].sort();
    const upcomingCount = visibleSessions.filter(s => s.scheduled_date >= todayStr && s.status === 'Pending').length;
    const hasFutureClasses = visibleSessions.some(s => s.scheduled_date >= todayStr);

    if (!hasFutureClasses) {
      scheduleEmpty.style.display = 'flex';
      scheduleWeeks.innerHTML = '';
      scheduleSubtext.textContent = data.students.length
        ? 'No classes from today onward.'
        : 'Add a student and their classes will appear here automatically.';
      return;
    }
    scheduleEmpty.style.display = 'none';

    const lastShown = shownDates[shownDates.length - 1];
    scheduleSubtext.textContent = `${upcomingCount} upcoming class${upcomingCount === 1 ? '' : 'es'}` +
      (filterId ? ` for ${visibleStudents[0]?.name || 'this student'}` : ` for ${visibleStudents.length} student${visibleStudents.length === 1 ? '' : 's'}`) +
      ` · until ${formatDisplayDate(lastShown)}`;

    const thisWeek = mondayOf(todayStr);
    let html = '';
    let emptyWeeks = 0;
    for (let week = startWeek; week <= lastShown; week = offsetDays(week, 7)) {
      // Weeks with nothing in them (e.g. between the last class and the exam) collapse into one line
      const hasAnything = [0, 1, 2, 3, 4, 5, 6].some(i => byDate.has(offsetDays(week, i)));
      if (!hasAnything) { emptyWeeks++; continue; }
      if (!html) emptyWeeks = 0;
      if (emptyWeeks && html) { // only between weeks, never as the first row
        html +=`<div class="sched-gap">No classes for ${emptyWeeks} week${emptyWeeks === 1 ? '' : 's'}</div>`;
        emptyWeeks = 0;
      }

      // Weekdays from today onward (days already gone this week are left out)
      const days = [0, 1, 2, 3, 4].map(i => offsetDays(week, i)).filter(d => d >= todayStr);
      // Saturday/Sunday columns only appear when an extra weekend class (or exam) falls on them
      [5, 6].forEach(i => { const d = offsetDays(week, i); if (byDate.has(d)) days.push(d); });

      const weekClassCount = days.reduce((n, d) => n + (byDate.get(d) || []).filter(x => x.type === 'class' && x.s.status !== 'Missed').length, 0);
      const weekLabel = week === thisWeek ? 'This week' : week === offsetDays(thisWeek, 7) ? 'Next week' : `Week of ${formatDisplayDate(week)}`;

      html += `<section class="sched-week">
        <header class="sched-week-head"><h3>${weekLabel}</h3><span>${weekClassCount} class${weekClassCount === 1 ? '' : 'es'}</span></header>
        <div class="sched-days" style="--days:${days.length}">`;

      days.forEach(d => {
        const items = (byDate.get(d) || []).slice().sort((a, b) => {
          if (a.type !== b.type) return a.type === 'exam' ? 1 : -1;
          const ta = a.type === 'class' ? a.st.class_time : '';
          const tb = b.type === 'class' ? b.st.class_time : '';
          return ta.localeCompare(tb) || (a.st.name || '').localeCompare(b.st.name || '');
        });
        const { weekday, date } = shortDay(d);
        const cls = ['sched-day'];
        if (d === todayStr) cls.push('is-today');
        if (d < todayStr) cls.push('is-past');
        if (!items.length) cls.push('is-empty');
        if (isWeekendStr(d)) cls.push('is-weekend');

        html += `<div class="${cls.join(' ')}">
          <div class="sched-day-head"><span class="sd-weekday">${weekday}</span><span class="sd-date">${date}</span>${d === todayStr ? '<span class="sd-today">Today</span>' : ''}</div>
          <div class="sched-day-items">`;

        if (!items.length) html += '<span class="sched-none">No classes</span>';
        items.forEach(it => {
          if (it.type === 'exam') {
            html += `<button type="button" class="sched-chip sc-exam" data-student-id="${it.st.id}" title="${escapeHtml(it.st.name)}'s exam">
              <span class="chip-time">🎓 Exam</span><span class="chip-name">${escapeHtml(it.st.name)}</span></button>`;
            return;
          }
          const s = it.s;
          const isTodayOpen = s.status === 'Pending' && d === todayStr;
          const stCls = s.status === 'Taken' ? 'sc-taken' : s.status === 'Missed' ? 'sc-missed' : isTodayOpen ? 'sc-today' : 'sc-pending';
          const extra = [stCls];
          if (s.is_weekend) extra.push('sc-weekend');
          if (state.highlightStudentId && String(s.student_id) === String(state.highlightStudentId)) extra.push('is-new');
          const isLast = lastClassId.get(s.student_id) === s.id;
          const meta = s.status === 'Missed' ? 'Missed'
            : `#${classNo.get(s.id)}/${it.st.max_sessions || 20}${s.is_weekend ? ' · extra' : ''}${isLast ? ' 🏁' : ''}`;
          html += `<button type="button" class="sched-chip ${extra.join(' ')}" data-student-id="${s.student_id}"
              title="${escapeHtml(it.st.name)} · ${escapeHtml(formatDisplayDate(d))} · ${escapeHtml(formatTimeDisplay(it.st.class_time))}${isLast ? ' · last class' : ''}">
            <span class="chip-time">${escapeHtml(formatTimeDisplay(it.st.class_time))}</span>
            <span class="chip-name">${escapeHtml(it.st.name)}</span>
            <span class="chip-meta">${meta}</span>
          </button>`;
        });
        html += '</div></div>';
      });
      html += '</div></section>';
    }
    scheduleWeeks.innerHTML = html;

    scheduleWeeks.querySelectorAll('.sched-chip').forEach(chip => {
      chip.addEventListener('click', () => switchView('profile', Number(chip.dataset.studentId)));
    });

    // Just-added student: briefly highlight their classes and scroll to the first one
    if (state.highlightStudentId) {
      state.highlightStudentId = null;
      const first = scheduleWeeks.querySelector('.is-new');
      if (first) setTimeout(() => first.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      setTimeout(() => scheduleWeeks.querySelectorAll('.is-new').forEach(c => c.classList.remove('is-new')), 6000);
    }
  }

  scheduleFilter.addEventListener('change', renderSchedule);

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
          ${student.exam_date ? `<div class="card-meta-row">
            <span>Exam Date:</span>
            <strong>${formatDisplayDate(student.exam_date)}</strong>
          </div>` : ''}
          <div class="card-meta-row">
            <span>Next Class:</span>
            <span>${student.next_pending_date ? formatDisplayDate(student.next_pending_date) : '—'}</span>
          </div>
          <div class="card-meta-row">
            <span>Expected End:</span>
            <span>${student.expected_end_date ? formatDisplayDate(student.expected_end_date) : '—'}</span>
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
    // Avoid showing the previous student's details while the new one loads
    if (!state.currentStudentData || String(state.currentStudentData.student.id) !== String(studentId)) {
      state.currentStudentData = null;
      state.calendarMonth = null;          // new student -> pick a sensible month again
      state.calendarSelectedDate = null;
      calendarGrid.innerHTML = '';
      calendarDayDetail.style.display = 'none';
      profileName.textContent = 'Loading…';
      profileAvatar.textContent = '…';
    }
    profileSessionsLoading.style.display = 'flex';
    sessionsTimeline.innerHTML = '';

    try {
      const data = await apiRequest(`/api/students/${studentId}`);
      profileSessionsLoading.style.display = 'none';

      state.currentStudentData = data;
      renderProfile(data);

    } catch (err) {
      profileSessionsLoading.style.display = 'none';
      showToast(`Error: ${err.message}`, 'error');
      if (err.status === 404) {
        // Student was deleted (e.g. in another tab) — go back to the list
        switchView('students');
      }
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
    // Students without an exam date: hide the exam tags entirely
    profileExam.textContent = student.exam_date ? 'Exam: ' + formatDisplayDate(student.exam_date) : '';
    profileExam.hidden = !student.exam_date;
    profileDaysToExam.hidden = !student.exam_date;

    // Computed from the teacher's local date (the server runs in UTC)
    const daysToExam = student.exam_date ? daysFromToday(student.exam_date) : null;
    if (daysToExam === null) {
      profileDaysToExam.textContent = '';
    } else if (daysToExam < 0) {
      profileDaysToExam.textContent = 'Exam Passed';
    } else if (daysToExam === 0) {
      profileDaysToExam.textContent = 'Exam Today!';
    } else {
      profileDaysToExam.textContent = `${daysToExam} day${daysToExam === 1 ? '' : 's'} to exam`;
    }

    // Metrics Cards
    metricCompleted.textContent = metrics.completed_count;
    metricPending.textContent = metrics.pending_count;
    metricMissed.textContent = metrics.missed_count;
    metricEndDate.textContent = metrics.expected_end_date ? formatDisplayDate(metrics.expected_end_date) : 'N/A';

    // Progress bar
    const totalMax = student.max_sessions || 20;
    const completedPct = Math.min(100, Math.round((metrics.completed_count / totalMax) * 100));
    const missedPct = Math.min(100 - completedPct, Math.round((metrics.missed_count / totalMax) * 100));

    progressText.textContent = `${metrics.completed_count} / ${totalMax} Sessions Completed`;
    progressPercent.textContent = `${completedPct}%`;
    barTaken.style.width = `${completedPct}%`;
    barMissed.style.width = `${missedPct}%`;

    // Schedule Timeline
    // Missed rows are history, not one of the 20 classes, so they are not numbered.
    const classCount = sessions.filter(s => s.status !== 'Missed').length;
    sessionCountBadge.textContent = `${classCount}/${totalMax}`;
    sessionsTimeline.innerHTML = '';

    const todayStr = getTodayLocalDateStr();
    let classNumber = 0;

    sessions.forEach((s) => {
      const row = document.createElement('div');

      const isPending = s.status === 'Pending';
      const isTaken = s.status === 'Taken';
      const isMissed = s.status === 'Missed';
      const statusClass = isPending ? 'status-pending' : (isTaken ? 'status-taken' : 'status-missed');
      const isWeekend = !!s.is_weekend;
      const isToday = s.scheduled_date === todayStr;
      const numberLabel = isMissed ? '—' : `#${++classNumber}`;

      row.className = 'session-row' + (isToday ? ' is-today' : '') + (isMissed ? ' is-missed' : '');

      row.innerHTML = `
        <div class="session-left">
          <div class="session-number-badge" title="${isMissed ? 'Missed (not counted)' : 'Class number'}">${numberLabel}</div>
          <div class="session-date-info">
            <span class="session-date-main">${formatDisplayDate(s.scheduled_date)}</span>
            <span class="session-date-day">${formatDayName(s.scheduled_date)}${isToday ? ' · Today' : ''}</span>
          </div>
          ${isWeekend ? '<span class="tag-weekend">Weekend Class</span>' : ''}
        </div>

        <div class="session-right">
          <span class="card-status-badge ${isPending && s.scheduled_date < todayStr ? 'status-unmarked' : statusClass}">${isPending ? (s.scheduled_date < todayStr ? 'Not marked' : 'Upcoming') : isTaken ? 'Completed' : 'Missed'}</span>
        </div>
      `;

      // Clicking the date in the list jumps to that day in the calendar
      const dateInfo = row.querySelector('.session-date-info');
      dateInfo.title = 'Show in calendar';
      dateInfo.addEventListener('click', () => {
        selectCalendarDate(s.scheduled_date);
        document.querySelector('.calendar-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      sessionsTimeline.appendChild(row);
    });

    renderCalendar();
  }

  // ================= Profile Calendar =================
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Builds a lookup of date -> { session, number } for the current student.
   * Numbering matches the session list: Missed sessions are not numbered.
   */
  function buildCalendarIndex(sessions) {
    const byDate = new Map();
    let n = 0;
    sessions.forEach(s => {
      const number = s.status === 'Missed' ? null : ++n;
      const existing = byDate.get(s.scheduled_date);
      // If a date ever has two rows, prefer the active (non-Missed) one
      if (!existing || existing.session.status === 'Missed') {
        byDate.set(s.scheduled_date, { session: s, number });
      }
    });
    return byDate;
  }

  // Months the calendar can navigate between: course start .. exam (or last session if later)
  function calendarRange(student, sessions) {
    const dates = sessions.map(s => s.scheduled_date);
    const first = [student.start_date, ...dates].sort()[0];
    const last = [student.exam_date, ...dates].sort().slice(-1)[0];
    return { min: first.slice(0, 7), max: last.slice(0, 7) };
  }

  function pickDefaultMonth(student, sessions) {
    const { min, max } = calendarRange(student, sessions);
    const thisMonth = getTodayLocalDateStr().slice(0, 7);
    if (thisMonth >= min && thisMonth <= max) return thisMonth;
    const nextPending = sessions.find(s => s.status === 'Pending');
    return (nextPending ? nextPending.scheduled_date : student.start_date).slice(0, 7);
  }

  function renderCalendar() {
    const data = state.currentStudentData;
    if (!data) return;
    const student = data.student;
    const sessions = data.sessions || [];
    const index = buildCalendarIndex(sessions);
    const { min, max } = calendarRange(student, sessions);

    if (!state.calendarMonth) state.calendarMonth = pickDefaultMonth(student, sessions);
    const ym = state.calendarMonth;
    const [year, month] = ym.split('-').map(Number);

    calTitle.textContent = `${MONTH_NAMES[month - 1]} ${year}`;
    calPrev.disabled = ym <= min;
    calNext.disabled = ym >= max;
    calToday.style.display = ym === getTodayLocalDateStr().slice(0, 7) ? 'none' : '';

    const todayStr = getTodayLocalDateStr();
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const leadingBlanks = (firstDay.getUTCDay() + 6) % 7; // Monday-first week
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;

    let html = '';
    for (let cell = 0; cell < totalCells; cell++) {
      const dayNum = cell - leadingBlanks + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        html += '<div class="cal-day cal-empty" aria-hidden="true"></div>';
        continue;
      }

      const dateStr = `${ym}-${String(dayNum).padStart(2, '0')}`;
      const entry = index.get(dateStr);
      const isExam = dateStr === student.exam_date;
      const isWeekendCol = cell % 7 >= 5;
      const classes = ['cal-day'];
      let mark = '';
      let label = '';
      let aria = formatDisplayDate(dateStr);

      if (entry) {
        const st = entry.session.status;
        const unmarked = st === 'Pending' && dateStr < todayStr; // past class nobody marked yet
        classes.push(st === 'Taken' ? 'cal-taken' : st === 'Missed' ? 'cal-missed' : unmarked ? 'cal-unmarked' : 'cal-pending');
        if (entry.session.is_weekend) classes.push('cal-weekend');
        mark = st === 'Taken' ? '✓' : st === 'Missed' ? '✕' : unmarked ? '?' : '•';
        label = st === 'Missed' ? 'Missed' : `#${entry.number}`;
        aria += `: ${st === 'Missed' ? 'missed class' : `class ${entry.number}, ${st === 'Taken' ? 'completed' : unmarked ? 'not marked' : 'upcoming'}`}`;
      } else if (isExam) {
        classes.push('cal-exam');
        mark = '🎓';
        label = 'Exam';
        aria += ': exam day';
      } else if (isWeekendCol) {
        classes.push('cal-off');
      }
      if (dateStr === todayStr) { classes.push('is-today'); aria += ' (today)'; }
      if (dateStr === state.calendarSelectedDate) classes.push('is-selected');

      const clickable = entry || isExam;
      html += clickable
        ? `<button type="button" class="${classes.join(' ')}" data-date="${dateStr}" aria-label="${escapeHtml(aria)}">`
          + `<span class="cal-num">${dayNum}</span><span class="cal-mark">${mark}</span><span class="cal-label">${label}</span></button>`
        : `<div class="${classes.join(' ')}"><span class="cal-num">${dayNum}</span></div>`;
    }
    calendarGrid.innerHTML = html;

    calendarGrid.querySelectorAll('button[data-date]').forEach(btn => {
      btn.addEventListener('click', () => selectCalendarDate(btn.dataset.date));
    });

    renderCalendarDetail(index);
  }

  function selectCalendarDate(dateStr) {
    state.calendarSelectedDate = dateStr;
    state.calendarMonth = dateStr.slice(0, 7);
    renderCalendar();
  }

  function renderCalendarDetail(index) {
    const dateStr = state.calendarSelectedDate;
    const student = state.currentStudentData.student;
    const entry = dateStr ? index.get(dateStr) : null;

    if (!dateStr || (!entry && dateStr !== student.exam_date)) {
      calendarDayDetail.style.display = 'none';
      return;
    }

    if (!entry) {
      calendarDayDetail.innerHTML = `
        <div class="detail-main">
          <strong>${formatDisplayDate(dateStr)}</strong>
          <span class="card-status-badge cal-exam-badge">🎓 Exam day</span>
        </div>
        <p class="detail-note">No classes are scheduled on or after the exam date.</p>`;
      calendarDayDetail.style.display = 'block';
      return;
    }

    const s = entry.session;
    const statusClass = s.status === 'Pending' ? 'status-pending' : s.status === 'Taken' ? 'status-taken' : 'status-missed';
    const isPast = dateStr < getTodayLocalDateStr();
    const unmarked = s.status === 'Pending' && isPast;
    const notes = {
      Pending: unmarked
        ? 'This class has not been marked yet.'
        : 'Upcoming class. Tick it on the Today page on the day of the class.',
      Taken: 'This class is completed.',
      Missed: 'This class was missed. A makeup class was added at the end of the schedule if one fit before the exam.'
    };
    const statusText = { Pending: unmarked ? 'Not marked' : 'Upcoming', Taken: 'Completed', Missed: 'Missed' };
    // Marking/correcting happens only in the Today page; offer a shortcut for today and past days.
    const canOpenDay = !s.is_weekend && dateStr <= getTodayLocalDateStr();

    calendarDayDetail.innerHTML = `
      <div class="detail-main">
        <strong>${formatDisplayDate(dateStr)}</strong>
        <span class="detail-class-no">${entry.number ? `Class #${entry.number} of ${student.max_sessions || 20}` : 'Not counted'}</span>
        <span class="card-status-badge ${unmarked ? 'status-unmarked' : statusClass}">${statusText[s.status] || s.status}</span>
        ${s.is_weekend ? '<span class="tag-weekend">Weekend Class</span>' : ''}
      </div>
      <p class="detail-note">${notes[s.status] || ''}</p>
      ${canOpenDay ? `<button type="button" class="btn btn-secondary detail-open-day" data-open-day="${dateStr}">
        📋 Open this day on the Today page${s.status === 'Pending' ? ' to tick it' : ' to change it'}
      </button>` : ''}`;
    calendarDayDetail.style.display = 'block';

    const openBtn = calendarDayDetail.querySelector('[data-open-day]');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        state.selectedDate = dateStr;
        state.attendancePreselectStudentId = student.id;
        switchView('dashboard');
      });
    }
  }

  calPrev.addEventListener('click', () => {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    renderCalendar();
  });
  calToday.addEventListener('click', () => {
    state.calendarMonth = getTodayLocalDateStr().slice(0, 7);
    renderCalendar();
  });

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

  // ================= Add Student Modal =================
  function openAddStudentModal() {
    formAddError.style.display = 'none';
    formAddStudent.reset();

    const today = getTodayLocalDateStr();
    document.getElementById('inputStartDate').value = today;
    document.getElementById('inputNextClassDate').value = comingMonday(today);
    document.getElementById('inputExamDate').value = ''; // optional: most students may not have one yet
    document.getElementById('inputFinishedCount').value = 1;
    applyStudentMode();

    modalAddStudent.style.display = 'flex';
    document.getElementById('inputStudentName').focus();
  }

  // Today if it is Monday, otherwise the next Monday
  function comingMonday(dateStr) {
    const dow = parseLocalDate(dateStr).getUTCDay(); // 0 = Sun ... 1 = Mon
    return offsetDays(dateStr, (8 - dow) % 7);
  }

  function isAlreadyStartedMode() {
    return document.getElementById('modeStarted').checked;
  }

  // Shows the fields for "New student" or "Already started" and keeps `required` in sync
  function applyStudentMode() {
    const started = isAlreadyStartedMode();
    document.getElementById('groupStartDate').hidden = started;
    document.getElementById('groupStarted').hidden = !started;
    document.getElementById('inputStartDate').required = !started;
    document.getElementById('inputNextClassDate').required = started;
    document.getElementById('inputFinishedCount').required = started;
    updateSchedulePreview();
  }

  // Weekday dates from `from` (inclusive) before `exam`, at most `limit` of them
  function weekdaysFrom(from, exam, limit) {
    const out = [];
    for (let d = from; d < exam && out.length < limit; d = offsetDays(d, 1)) {
      if (!isWeekendStr(d)) out.push(d);
    }
    return out;
  }

  // Live preview of what will be scheduled, in plain words
  function updateSchedulePreview() {
    const preview = document.getElementById('schedulePreview');
    // Exam date is optional; without one there is no cutoff
    const examInput = document.getElementById('inputExamDate').value;
    const exam = examInput || '9999-12-31';
    const noExamNote = examInput ? '' : ' No exam date, so there is no cutoff.';
    const todayStr = getTodayLocalDateStr();
    const show = (kind, text) => {
      preview.className = `alert-box alert-${kind}`;
      preview.textContent = text;
      preview.style.display = 'block';
    };

    if (isAlreadyStartedMode()) {
      const next = document.getElementById('inputNextClassDate').value;
      const done = parseInt(document.getElementById('inputFinishedCount').value, 10);
      if (!next || !exam || isNaN(done)) { preview.style.display = 'none'; return; }
      if (done < 1 || done > 19) {
        show('error', 'Enter how many classes are already done: a number from 1 to 19.');
        return;
      }
      const left = 20 - done;
      const dates = weekdaysFrom(next, exam, left);
      if (!dates.length) {
        show('error', 'The next class must be a weekday before the exam date.');
        return;
      }
      const first = dates[0];
      const last = dates[dates.length - 1];
      const pastNote = first < todayStr
        ? ' The next class date is in the past: any of those days not ticked will count as missed.'
        : '';
      if (dates.length < left) {
        show('warning', `${done} attended classes will be recorded. Only ${dates.length} of the remaining ${left} classes fit before the exam (${formatDisplayDate(first)} to ${formatDisplayDate(last)}).` + pastNote);
      } else {
        show(pastNote ? 'warning' : 'info', `${done} attended classes will be recorded. The remaining ${left} classes run Monday to Friday from ${formatDisplayDate(first)} to ${formatDisplayDate(last)}.` + pastNote + noExamNote);
      }
      return;
    }

    const start = document.getElementById('inputStartDate').value;
    if (!start || !exam) { preview.style.display = 'none'; return; }
    if (start >= exam) {
      show('error', 'The first class date must be before the exam date.');
      return;
    }
    const dates = weekdaysFrom(start, exam, 20);
    if (!dates.length) {
      show('error', 'No weekdays fit before the exam date.');
      return;
    }
    const pastDays = dates.filter(d => d < todayStr).length;
    const pastNote = pastDays
      ? ` The first class date is in the past: ${pastDays} class day(s) before today will count as missed. If this student already attended classes, choose "Already started" instead.`
      : '';
    const last = dates[dates.length - 1];
    if (dates.length < 20) {
      show('warning', `Only ${dates.length} of 20 classes (Mon–Fri) fit before the exam, last class ${formatDisplayDate(last)}.` + pastNote);
    } else {
      show(pastNote ? 'warning' : 'info', `20 classes (Mon–Fri) will be scheduled, from ${formatDisplayDate(dates[0])} to ${formatDisplayDate(last)}.` + pastNote + noExamNote);
    }
  }

  ['inputStartDate', 'inputExamDate', 'inputNextClassDate'].forEach(id =>
    document.getElementById(id).addEventListener('change', updateSchedulePreview));
  document.getElementById('inputFinishedCount').addEventListener('input', updateSchedulePreview);
  document.getElementById('modeNew').addEventListener('change', applyStudentMode);
  document.getElementById('modeStarted').addEventListener('change', applyStudentMode);

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
    const showError = (msg) => {
      formAddError.textContent = msg;
      formAddError.style.display = 'block';
    };

    const name = document.getElementById('inputStudentName').value.trim();
    const classTime = document.getElementById('inputClassTime').value;
    const examDate = document.getElementById('inputExamDate').value;
    const started = isAlreadyStartedMode();

    if (!name || !classTime) {
      showError('Please fill in the name and class time.');
      return;
    }

    const payload = { name, class_time: classTime, exam_date: examDate };
    if (started) {
      const nextClass = document.getElementById('inputNextClassDate').value;
      const done = parseInt(document.getElementById('inputFinishedCount').value, 10);
      if (!nextClass) { showError('Please choose the date of the next class.'); return; }
      if (isNaN(done) || done < 1 || done > 19) { showError('Classes already finished must be a number from 1 to 19.'); return; }
      if (examDate && nextClass >= examDate) { showError('The next class must be before the exam date.'); return; }
      payload.next_class_date = nextClass;
      payload.classes_already_finished = done;
    } else {
      const startDate = document.getElementById('inputStartDate').value;
      if (!startDate) { showError('Please choose the first class date.'); return; }
      if (examDate && startDate >= examDate) { showError('The first class date must be before the exam date.'); return; }
      payload.start_date = startDate;
      payload.classes_already_finished = 0;
    }

    try {
      submitBtn.disabled = true;
      spinner.style.display = 'inline-block';

      const data = await apiRequest('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      submitBtn.disabled = false;
      spinner.style.display = 'none';

      if (!data.success) {
        throw new Error(data.error || 'Failed to create student');
      }

      closeAddStudentModal();
      showToast(data.message || `Student ${name} enrolled with initial schedule.`, 'success');

      // Show the new student's classes straight away on the Schedule, highlighted
      state.highlightStudentId = data.student_id || null;
      scheduleFilter.value = '';
      switchView('schedule');

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
    weekendStudentLabel.textContent = student.exam_date
      ? `For ${student.name} (Exam on ${formatDisplayDate(student.exam_date)})`
      : `For ${student.name}`;

    // Suggest today if it's a weekend, otherwise the coming Saturday
    const todayStr = getTodayLocalDateStr();
    const suggested = isWeekendStr(todayStr)
      ? todayStr
      : offsetDays(todayStr, 6 - parseLocalDate(todayStr).getUTCDay());
    if (student.exam_date) {
      const lastAllowed = offsetDays(student.exam_date, -1);
      inputWeekendDate.max = lastAllowed;
      inputWeekendDate.value = suggested <= lastAllowed ? suggested : '';
    } else {
      inputWeekendDate.removeAttribute('max'); // no exam -> no limit
      inputWeekendDate.value = suggested;
    }

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
  tabSchedule.addEventListener('click', () => switchView('schedule'));
  mobTabSchedule.addEventListener('click', () => switchView('schedule'));
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
  checkConnection();
  switchView('dashboard');

})();
