import { json, error, parseDate, formatDate, addDays, isWeekday } from '../_utils.js';
import { scheduleMakeup, validateClientToday, MAX_TOTAL_SESSIONS } from '../_schedule.js';

/**
 * GET /api/students/[id]
 * Fetches student profile, computed metrics, and all sessions
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const studentId = parseInt(context.params.id, 10);
    if (!studentId || isNaN(studentId)) {
      return error('Invalid student ID.', 400);
    }

    const student = await db.prepare(`
      SELECT id, name, start_date, class_time, exam_date, max_sessions
      FROM students
      WHERE id = ?
    `).bind(studentId).first();

    if (!student) {
      return error('Student not found.', 404);
    }

    // Fetch all sessions ordered chronologically
    const { results: sessions } = await db.prepare(`
      SELECT id, student_id, scheduled_date, status, is_weekend
      FROM sessions
      WHERE student_id = ?
      ORDER BY scheduled_date ASC, id ASC
    `).bind(studentId).all();

    // Compute metrics
    const totalSessions = sessions.length;
    const completedCount = sessions.filter(s => s.status === 'Taken').length;
    const missedCount = sessions.filter(s => s.status === 'Missed').length;
    const pendingCount = sessions.filter(s => s.status === 'Pending').length;

    const pendingDates = sessions.filter(s => s.status === 'Pending').map(s => s.scheduled_date);
    const allDates = sessions.filter(s => s.status !== 'Missed').map(s => s.scheduled_date); // missed classes don't end a course

    const expectedEndDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
    const nextPendingDate = pendingDates.length > 0 ? pendingDates[0] : null;

    // Days until exam
    const today = parseDate(formatDate(new Date()));
    const examDate = parseDate(student.exam_date);
    const daysUntilExam = examDate && today ? Math.round((examDate - today) / (1000 * 60 * 60 * 24)) : null;

    return json({
      success: true,
      student,
      metrics: {
        total_sessions: totalSessions,
        max_sessions: student.max_sessions,
        completed_count: completedCount,
        missed_count: missedCount,
        pending_count: pendingCount,
        expected_end_date: expectedEndDate,
        next_pending_date: nextPendingDate,
        days_until_exam: daysUntilExam
      },
      sessions: sessions || []
    });

  } catch (err) {
    return error(`Failed to load student details: ${err.message}`, 500);
  }
}

/**
 * DELETE /api/students/[id]
 * Deletes a student and their sessions
 */
export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const studentId = parseInt(context.params.id, 10);
    if (!studentId || isNaN(studentId)) {
      return error('Invalid student ID.', 400);
    }

    await db.batch([
      db.prepare(`DELETE FROM sessions WHERE student_id = ?`).bind(studentId),
      db.prepare(`DELETE FROM students WHERE id = ?`).bind(studentId)
    ]);

    return json({
      success: true,
      message: 'Student and associated sessions deleted successfully.'
    });

  } catch (err) {
    return error(`Failed to delete student: ${err.message}`, 500);
  }
}


const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * PATCH /api/students/[id]
 * Edit a student: { name?, class_time?, exam_date? ('' = no exam), remove_after_exam? }
 *
 * Class time applies to every class (it is stored on the student).
 * If a new exam date falls before some upcoming (Pending) classes, those classes would break
 * the Exam Cutoff Rule. The first request returns 409 with `needs_confirmation` and how many
 * classes are affected; resending with remove_after_exam = true removes them and saves.
 */
export async function onRequestPatch(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const studentId = parseInt(context.params.id, 10);
    if (!studentId || isNaN(studentId)) return error('Invalid student ID.', 400);

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }

    const student = await db.prepare(`SELECT * FROM students WHERE id = ?`).bind(studentId).first();
    if (!student) return error('Student not found.', 404);

    let name = student.name;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) return error('Student name is required.', 400);
      if (body.name.trim().length > 100) return error('Student name must be 100 characters or fewer.', 400);
      name = body.name.trim();
    }

    let classTime = student.class_time;
    if (body.class_time !== undefined) {
      if (typeof body.class_time !== 'string' || !TIME_RE.test(body.class_time.trim())) {
        return error('Class time must be a valid time.', 400);
      }
      classTime = body.class_time.trim();
    }

    let examDate = student.exam_date;
    if (body.exam_date !== undefined) {
      const raw = typeof body.exam_date === 'string' ? body.exam_date.trim() : '';
      if (raw) {
        const d = parseDate(raw);
        if (!d) return error('Exam date must be a valid date, or left empty if there is no exam.', 400);
        examDate = formatDate(d);
      } else {
        examDate = '';
      }
    }

    // Upcoming classes that would be on or after the new exam date
    let affected = [];
    if (examDate && examDate !== student.exam_date) {
      const { results } = await db.prepare(`
        SELECT id, scheduled_date FROM sessions
        WHERE student_id = ? AND status = 'Pending' AND scheduled_date >= ?
        ORDER BY scheduled_date
      `).bind(studentId, examDate).all();
      affected = results || [];
    }

    if (affected.length && body.remove_after_exam !== true) {
      return json({
        success: false,
        needs_confirmation: true,
        affected_count: affected.length,
        affected_dates: affected.map(r => r.scheduled_date),
        error: `${affected.length} upcoming class(es) fall on or after the new exam date and would be removed.`
      }, 409);
    }

    const counts = await db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'Taken' THEN 1 ELSE 0 END) AS taken,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
        COUNT(*) AS all_rows
      FROM sessions WHERE student_id = ?
    `).bind(studentId).first();
    // A student added with "No dates yet" has no classes at all until a first class date is set
    const hasSchedule = (counts?.all_rows || 0) > 0;
    const takenNow = counts?.taken || 0;
    const pendingAfterExam = (counts?.pending || 0) - affected.length;
    const activeNow = takenNow + pendingAfterExam; // classes in the schedule (not Missed)

    // Total classes for the course: classes are added to / removed from the end of the schedule
    const oldMax = student.max_sessions || 20;
    let maxSessions = oldMax;
    if (body.total_sessions !== undefined && body.total_sessions !== null && body.total_sessions !== '') {
      maxSessions = parseInt(body.total_sessions, 10);
      if (isNaN(maxSessions) || maxSessions < 1 || maxSessions > MAX_TOTAL_SESSIONS) {
        return error(`Total classes must be a number from 1 to ${MAX_TOTAL_SESSIONS}.`, 400);
      }
    }

    // "Classes attended so far": validate before changing anything
    let target = null;
    if (body.classes_attended !== undefined && body.classes_attended !== null && body.classes_attended !== '') {
      target = parseInt(body.classes_attended, 10);
      if (isNaN(target) || target < 0 || target > maxSessions) {
        return error(`Classes attended must be a number from 0 to ${maxSessions}.`, 400);
      }
    }
    const attendedAfter = target === null ? takenNow : target;
    if (maxSessions < attendedAfter) {
      return error(`${attendedAfter} class(es) are already attended, so total classes can't be less than ${attendedAfter}.`, 400);
    }
    if (target !== null && maxSessions <= oldMax && hasSchedule) {
      const pendingLeft = pendingAfterExam - Math.max(0, activeNow - maxSessions);
      if (target - takenNow > pendingLeft) {
        return error(`Only ${pendingLeft} class(es) are left, so classes attended can be at most ${takenNow + pendingLeft}.`, 400);
      }
    }

    // First class date for a student who has no class dates yet: plan their classes Mon–Fri
    let firstClassPlan = null;
    if (body.first_class_date) {
      if (hasSchedule) return error('This student already has class dates.', 400);
      let first = parseDate(body.first_class_date);
      if (!first) return error('First class date must be a valid date.', 400);
      while (!isWeekday(first)) first = addDays(first, 1);
      const exam = parseDate(examDate);
      const plan = [];
      for (let d = first; plan.length < maxSessions && (!exam || d.getTime() < exam.getTime()); d = addDays(d, 1)) {
        if (isWeekday(d)) plan.push(formatDate(d));
      }
      if (!plan.length) return error('The first class must be before the exam date.', 400);
      firstClassPlan = plan;
      target = null; // nothing attended yet for a student who is only now getting dates
    } else if (!hasSchedule) {
      target = null; // no classes yet: attended can't change; total is just stored
    }

    const stmts = [
      db.prepare(`UPDATE students SET name = ?, class_time = ?, exam_date = ?, max_sessions = ? WHERE id = ?`)
        .bind(name, classTime, examDate, maxSessions, studentId)
    ];
    affected.forEach(r => stmts.push(
      db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(r.id)
    ));
    if (firstClassPlan) {
      const ins = db.prepare(`INSERT INTO sessions (student_id, scheduled_date, status, is_weekend) VALUES (?, ?, 'Pending', 0)`);
      firstClassPlan.forEach(d => stmts.push(ins.bind(studentId, d)));
      stmts.push(db.prepare(`UPDATE students SET start_date = ? WHERE id = ?`).bind(firstClassPlan[0], studentId));
    }
    await db.batch(stmts);

    // Apply the new total: add classes at the end, or remove upcoming classes from the end
    let totalNote = '';
    if (firstClassPlan) {
      totalNote = ` ${firstClassPlan.length} class(es) planned Monday to Friday from ${firstClassPlan[0]} to ${firstClassPlan[firstClassPlan.length - 1]}.` +
        (firstClassPlan.length < maxSessions ? ` Only ${firstClassPlan.length} fit before the exam.` : '');
    } else if (!hasSchedule) {
      if (maxSessions !== oldMax) totalNote = ` Total classes set to ${maxSessions}.`;
    } else if (maxSessions > activeNow && maxSessions !== oldMax) {
      const want = maxSessions - activeNow;
      const today = validateClientToday(body.today);
      let added = 0;
      for (let i = 0; i < want; i++) {
        const m = await scheduleMakeup(db, { student_id: studentId, scheduled_date: today || formatDate(new Date()), exam_date: examDate }, maxSessions, today);
        if (!m.inserted) break;
        added++;
      }
      totalNote = ` Total classes set to ${maxSessions}: ${added} class(es) added at the end.` +
        (added < want ? ` ${want - added} could not be added before the exam date.` : '');
    } else if (maxSessions < activeNow) {
      const remove = activeNow - maxSessions; // never more than the upcoming classes (checked above)
      const { results: lastPending } = await db.prepare(`
        SELECT id FROM sessions WHERE student_id = ? AND status = 'Pending'
        ORDER BY scheduled_date DESC, id DESC LIMIT ?
      `).bind(studentId, remove).all();
      if (lastPending?.length) {
        await db.batch(lastPending.map(r => db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(r.id)));
      }
      totalNote = ` Total classes set to ${maxSessions}: the last ${lastPending?.length || 0} upcoming class(es) were removed.`;
    } else if (maxSessions !== oldMax) {
      totalNote = ` Total classes set to ${maxSessions}.`;
    }

    // Change in classes attended, measured against the schedule after the new total
    let delta = 0;
    if (target !== null) {
      const now = await db.prepare(`
        SELECT SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending
        FROM sessions WHERE student_id = ?
      `).bind(studentId).first();
      const pendingLeft = now?.pending || 0;
      delta = target - takenNow;
      if (delta > pendingLeft) {
        // Only possible when the exam date stopped new classes being added above
        delta = pendingLeft;
        totalNote += ` Classes attended could only be raised to ${takenNow + pendingLeft}.`;
      }
    }

    // Apply the change in classes attended, keeping the total at max_sessions
    let attendedNote = '';
    if (delta > 0) {
      // Record the extra attended classes on free weekdays just before the first class,
      // and remove the same number of classes from the end of the schedule.
      const { results: rows } = await db.prepare(`SELECT scheduled_date FROM sessions WHERE student_id = ?`).bind(studentId).all();
      const occupied = new Set((rows || []).map(r => r.scheduled_date));
      const earliest = [...occupied].sort()[0] || formatDate(new Date());
      let d = parseDate(earliest);
      const ops = [];
      for (let added = 0; added < delta; ) {
        d = addDays(d, -1);
        const ds = formatDate(d);
        if (isWeekday(d) && !occupied.has(ds)) {
          ops.push(db.prepare(`INSERT INTO sessions (student_id, scheduled_date, status, is_weekend) VALUES (?, ?, 'Taken', 0)`).bind(studentId, ds));
          occupied.add(ds);
          added++;
        }
      }
      const { results: lastPending } = await db.prepare(`
        SELECT id FROM sessions WHERE student_id = ? AND status = 'Pending'
        ORDER BY scheduled_date DESC, id DESC LIMIT ?
      `).bind(studentId, delta).all();
      (lastPending || []).forEach(r => ops.push(db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(r.id)));
      await db.batch(ops);
      attendedNote = ` Classes attended raised by ${delta}; the last ${delta} upcoming class(es) were removed.`;
    } else if (delta < 0) {
      // Remove the earliest attended classes and add the same number back at the end.
      const remove = -delta;
      const { results: oldest } = await db.prepare(`
        SELECT id FROM sessions WHERE student_id = ? AND status = 'Taken'
        ORDER BY scheduled_date ASC, id ASC LIMIT ?
      `).bind(studentId, remove).all();
      await db.batch((oldest || []).map(r => db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(r.id)));
      const today = validateClientToday(body.today);
      let addedBack = 0;
      for (let i = 0; i < remove; i++) {
        const m = await scheduleMakeup(db, { student_id: studentId, scheduled_date: today || formatDate(new Date()), exam_date: examDate }, maxSessions, today);
        if (!m.inserted) break;
        addedBack++;
      }
      attendedNote = ` Classes attended lowered by ${remove}; ${addedBack} class(es) added at the end.` +
        (addedBack < remove ? ` ${remove - addedBack} could not be added before the exam date.` : '');
    }
    if (delta !== 0) {
      await db.prepare(`
        UPDATE students SET start_date = COALESCE((SELECT MIN(scheduled_date) FROM sessions WHERE student_id = ?), start_date)
        WHERE id = ?
      `).bind(studentId, studentId).run();
    }

    return json({
      success: true,
      student: { ...student, name, class_time: classTime, exam_date: examDate, max_sessions: maxSessions },
      removed_count: affected.length,
      attended_change: delta,
      message: `${name}: details saved.` +
        (affected.length ? ` ${affected.length} class(es) after the new exam date were removed.` : '') + totalNote + attendedNote
    });
  } catch (err) {
    return error(`Failed to update student: ${err.message}`, 500);
  }
}
