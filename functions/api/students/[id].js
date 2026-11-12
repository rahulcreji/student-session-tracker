import { json, error, parseDate, formatDate } from '../_utils.js';

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
    const allDates = sessions.map(s => s.scheduled_date);

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

    const stmts = [
      db.prepare(`UPDATE students SET name = ?, class_time = ?, exam_date = ? WHERE id = ?`)
        .bind(name, classTime, examDate, studentId)
    ];
    affected.forEach(r => stmts.push(
      db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(r.id)
    ));
    await db.batch(stmts);

    return json({
      success: true,
      student: { ...student, name, class_time: classTime, exam_date: examDate },
      removed_count: affected.length,
      message: `${name}: details saved.` + (affected.length ? ` ${affected.length} class(es) after the new exam date were removed.` : '')
    });
  } catch (err) {
    return error(`Failed to update student: ${err.message}`, 500);
  }
}
