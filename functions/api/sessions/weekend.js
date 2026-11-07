import { json, error, parseDate, formatDate, isWeekend } from '../_utils.js';

/**
 * POST /api/sessions/weekend   body: { "student_id": 1, "date": "YYYY-MM-DD" }
 *
 * Scenario C: Teacher adds a weekend class.
 * 1. INSERT the weekend date with status 'Taken' and is_weekend = 1.
 * 2. DELETE the student's very last Pending session (MAX scheduled_date) so the
 *    total stays capped at max_sessions (20).
 * Both statements run in a single D1 batch (atomic).
 *
 * Edge case: if the student has no Pending sessions left, the weekend class is
 * only allowed when it makes up for sessions lost to the exam cutoff
 * (i.e. Taken < max_sessions). Otherwise the course is already complete.
 */
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }

    const studentId = parseInt(body?.student_id, 10);
    if (!studentId || isNaN(studentId)) {
      return error('Valid student_id is required.', 400);
    }

    const parsedDate = parseDate(body?.date);
    if (!parsedDate) {
      return error('Valid date (YYYY-MM-DD) is required.', 400);
    }
    if (!isWeekend(parsedDate)) {
      return error('Selected date is not a weekend. Please pick a Saturday or Sunday.', 400);
    }
    const formattedDate = formatDate(parsedDate);

    const student = await db.prepare(`
      SELECT id, name, exam_date, max_sessions FROM students WHERE id = ?
    `).bind(studentId).first();
    if (!student) {
      return error('Student not found.', 404);
    }

    const examDateObj = parseDate(student.exam_date);
    if (examDateObj && parsedDate.getTime() >= examDateObj.getTime()) {
      return error(`Weekend class must be before the exam date (${student.exam_date}).`, 400);
    }

    const existing = await db.prepare(`
      SELECT id, status FROM sessions WHERE student_id = ? AND scheduled_date = ?
    `).bind(studentId, formattedDate).first();
    if (existing) {
      return error(`${student.name} already has a class on ${formattedDate} (${existing.status}).`, 409);
    }

    const lastPending = await db.prepare(`
      SELECT id, scheduled_date FROM sessions
      WHERE student_id = ? AND status = 'Pending'
      ORDER BY scheduled_date DESC, id DESC
      LIMIT 1
    `).bind(studentId).first();

    const insertStmt = db.prepare(`
      INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
      VALUES (?, ?, 'Taken', 1)
    `).bind(studentId, formattedDate);

    if (lastPending) {
      const [insertRes] = await db.batch([
        insertStmt,
        db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(lastPending.id)
      ]);

      return json({
        success: true,
        message: `Weekend class on ${formattedDate} added as Taken. The last pending class (${lastPending.scheduled_date}) was removed to keep the total at ${student.max_sessions || 20}.`,
        weekend_session: { id: insertRes.meta?.last_row_id ?? null, date: formattedDate, status: 'Taken', is_weekend: 1 },
        removed_pending_session: { id: lastPending.id, scheduled_date: lastPending.scheduled_date }
      }, 201);
    }

    // No Pending sessions left to swap out.
    const takenRow = await db.prepare(`
      SELECT COUNT(*) AS taken FROM sessions WHERE student_id = ? AND status = 'Taken'
    `).bind(studentId).first();
    const maxSessions = student.max_sessions || 20;

    if ((takenRow?.taken || 0) >= maxSessions) {
      return error(`${student.name} has already completed all ${maxSessions} sessions.`, 409);
    }

    const insertRes = await insertStmt.run();
    return json({
      success: true,
      message: `Weekend class on ${formattedDate} added as Taken (makeup for a lost session — no pending classes needed removing).`,
      weekend_session: { id: insertRes.meta?.last_row_id ?? null, date: formattedDate, status: 'Taken', is_weekend: 1 },
      removed_pending_session: null
    }, 201);
  } catch (err) {
    return error(`Failed to add weekend session: ${err.message}`, 500);
  }
}
