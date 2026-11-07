import { json, error, parseDate, formatDate, addDays, isWeekday } from './_utils.js';

/**
 * GET /api/students
 * Lists all students with their aggregate session metrics
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      return error('Database binding (DB) is missing.', 500);
    }

    const query = `
      SELECT 
        s.id,
        s.name,
        s.start_date,
        s.class_time,
        s.exam_date,
        s.max_sessions,
        COALESCE(SUM(CASE WHEN ses.status = 'Taken' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN ses.status = 'Missed' THEN 1 ELSE 0 END), 0) AS missed_count,
        COALESCE(SUM(CASE WHEN ses.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_count,
        COUNT(ses.id) AS total_sessions,
        MAX(ses.scheduled_date) AS expected_end_date,
        MIN(CASE WHEN ses.status = 'Pending' THEN ses.scheduled_date ELSE NULL END) AS next_pending_date
      FROM students s
      LEFT JOIN sessions ses ON s.id = ses.student_id
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE ASC
    `;

    const { results } = await db.prepare(query).all();

    return json({
      success: true,
      students: results || []
    });
  } catch (err) {
    return error(`Failed to fetch students: ${err.message}`, 500);
  }
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/students
 * Scenario A: Create a student and generate their initial schedule.
 *  - Up to max_sessions (20) weekday (Mon-Fri) sessions from start_date.
 *  - First N (= classes_already_finished) are 'Taken', the rest 'Pending'.
 *  - Exam Cutoff Rule: only dates strictly before exam_date are generated.
 *
 * Students who already started: send `next_class_date` instead of `start_date`
 * together with `classes_already_finished` = N. The N finished classes are recorded as
 * Taken on the N weekdays just before the next class, and the remaining classes are
 * scheduled Mon-Fri from the next class date.
 */
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      return error('Database binding (DB) is missing.', 500);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }

    const { name, start_date, class_time, exam_date } = body || {};
    const maxSessions = 20;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return error('Student name is required.', 400);
    }
    if (name.trim().length > 100) {
      return error('Student name must be 100 characters or fewer.', 400);
    }
    if (!class_time || typeof class_time !== 'string' || !TIME_RE.test(class_time.trim())) {
      return error('Class time is required (HH:MM, 24-hour).', 400);
    }

    const examDateObj = parseDate(exam_date);
    if (!examDateObj) {
      return error('Valid exam date (YYYY-MM-DD) is required.', 400);
    }

    const finishedRaw = parseInt(body.classes_already_finished, 10);
    const classesFinished = Math.min(maxSessions, Math.max(0, isNaN(finishedRaw) ? 0 : finishedRaw));

    let startDateObj;
    if (body.next_class_date) {
      // "Already started" student: N classes are done and the rest continue from next_class_date.
      // Pick the start date so that exactly N weekdays fall before the next class; the loop below
      // then records those N as Taken and schedules the remaining ones from the next class onward.
      let firstRemaining = parseDate(body.next_class_date);
      if (!firstRemaining) {
        return error('Valid next class date (YYYY-MM-DD) is required.', 400);
      }
      if (classesFinished >= maxSessions) {
        return error(`This student has already finished all ${maxSessions} classes.`, 400);
      }
      while (!isWeekday(firstRemaining)) firstRemaining = addDays(firstRemaining, 1);
      if (firstRemaining.getTime() >= examDateObj.getTime()) {
        return error('The next class must be before the exam date.', 400);
      }
      startDateObj = firstRemaining;
      for (let done = 0; done < classesFinished; ) {
        startDateObj = addDays(startDateObj, -1);
        if (isWeekday(startDateObj)) done++;
      }
    } else {
      startDateObj = parseDate(start_date);
      if (!startDateObj) {
        return error('Valid start date (YYYY-MM-DD) is required.', 400);
      }
    }

    if (startDateObj.getTime() >= examDateObj.getTime()) {
      return error('Start date must be before the exam date.', 400);
    }

    // Build the schedule first so we never create a student with zero sessions.
    const schedule = [];
    let curr = new Date(startDateObj.getTime());
    while (schedule.length < maxSessions && curr.getTime() < examDateObj.getTime()) {
      if (isWeekday(curr)) {
        schedule.push({
          date: formatDate(curr),
          status: schedule.length < classesFinished ? 'Taken' : 'Pending'
        });
      }
      curr = addDays(curr, 1);
    }

    if (schedule.length === 0) {
      return error('There are no weekdays between the start date and the exam date. Please pick different dates.', 400);
    }

    const trimmedName = name.trim();
    const trimmedTime = class_time.trim();

    const studentInsertRes = await db.prepare(`
      INSERT INTO students (name, start_date, class_time, exam_date, max_sessions)
      VALUES (?, ?, ?, ?, ?)
    `).bind(trimmedName, formatDate(startDateObj), trimmedTime, formatDate(examDateObj), maxSessions).run();

    const studentId = studentInsertRes.meta?.last_row_id;
    if (!studentId) {
      return error('Failed to retrieve the new student ID from the database.', 500);
    }

    try {
      const insertSession = db.prepare(`
        INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
        VALUES (?, ?, ?, 0)
      `);
      await db.batch(schedule.map(s => insertSession.bind(studentId, s.date, s.status)));
    } catch (batchErr) {
      // Roll back the student row so we don't leave an orphan without a schedule.
      await db.prepare(`DELETE FROM students WHERE id = ?`).bind(studentId).run().catch(() => {});
      throw batchErr;
    }

    const notes = [];
    if (schedule.length < maxSessions) {
      notes.push(`only ${schedule.length} weekday(s) fit before the exam`);
    }
    if (classesFinished > schedule.length) {
      notes.push(`only ${schedule.length} could be marked as already finished`);
    }

    const remaining = schedule.filter(s => s.status === 'Pending');
    const summary = body.next_class_date && remaining.length
      ? `${trimmedName} added: ${classesFinished} attended class(es) recorded, ${remaining.length} remaining from ${remaining[0].date} to ${remaining[remaining.length - 1].date}.`
      : `${trimmedName} enrolled with ${schedule.length} session(s).`;

    return json({
      success: true,
      student_id: studentId,
      sessions_created: schedule.length,
      capped_by_exam: schedule.length < maxSessions,
      message: summary + (notes.length ? ` Note: ${notes.join('; ')}.` : '')
    }, 201);
  } catch (err) {
    return error(`Failed to create student: ${err.message}`, 500);
  }
}
