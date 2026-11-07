import { json, error, parseDate, formatDate, isWeekend } from '../_utils.js';

/**
 * POST /api/sessions/weekend
 * Handles Scenario C: Adding a Weekend Class
 * 1. INSERT a new row for the weekend date with status='Taken' and is_weekend=1
 * 2. Capped at 20: DELETE the student's very last scheduled Pending session (Max scheduled_date where status='Pending')
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

    const { student_id, date } = body;
    const studentId = parseInt(student_id, 10);

    if (!studentId || isNaN(studentId)) {
      return error('Valid student_id is required.', 400);
    }

    const parsedDate = parseDate(date);
    if (!parsedDate) {
      return error('Valid date (YYYY-MM-DD) is required.', 400);
    }

    // Must be a Saturday or Sunday
    if (!isWeekend(parsedDate)) {
      return error('Selected date is not a weekend (must be a Saturday or Sunday).', 400);
    }

    const formattedDate = formatDate(parsedDate);

    // Verify student exists
    const student = await db.prepare(`
      SELECT id, name, exam_date, max_sessions 
      FROM students 
      WHERE id = ?
    `).bind(studentId).first();

    if (!student) {
      return error('Student not found.', 404);
    }

    // Cutoff check: Cannot schedule a weekend class on or after exam date
    const examDateObj = parseDate(student.exam_date);
    if (examDateObj && parsedDate.getTime() >= examDateObj.getTime()) {
      return error(`Cannot schedule a class on or after the exam date (${student.exam_date}).`, 400);
    }

    // Check if a session already exists on this date
    const existing = await db.prepare(`
      SELECT id, status FROM sessions 
      WHERE student_id = ? AND scheduled_date = ?
    `).bind(studentId, formattedDate).first();

    if (existing) {
      return error(`A session already exists on ${formattedDate} (Status: ${existing.status}).`, 400);
    }

    // Step 1: Insert weekend class with status 'Taken' and is_weekend = 1
    const insertRes = await db.prepare(`
      INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
      VALUES (?, ?, 'Taken', 1)
    `).bind(studentId, formattedDate).run();

    const weekendSessionId = insertRes.meta?.last_row_id;

    // Step 2: Find the student's very last scheduled 'Pending' session in the database
    const lastPending = await db.prepare(`
      SELECT id, scheduled_date 
      FROM sessions 
      WHERE student_id = ? AND status = 'Pending' 
      ORDER BY scheduled_date DESC, id DESC 
      LIMIT 1
    `).bind(studentId).first();

    let removedPendingInfo = null;

    if (lastPending) {
      await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(lastPending.id).run();
      removedPendingInfo = {
        id: lastPending.id,
        scheduled_date: lastPending.scheduled_date
      };
    }

    return json({
      success: true,
      message: removedPendingInfo
        ? `Added weekend class on ${formattedDate}. Removed last scheduled pending class on ${removedPendingInfo.scheduled_date} to keep total capped.`
        : `Added weekend class on ${formattedDate}. (No pending sessions were available to remove).`,
      weekend_session: {
        id: weekendSessionId,
        date: formattedDate,
        status: 'Taken',
        is_weekend: 1
      },
      removed_pending_session: removedPendingInfo
    }, 201);

  } catch (err) {
    return error(`Failed to add weekend session: ${err.message}`, 500);
  }
}

