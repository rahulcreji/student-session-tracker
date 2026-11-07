import { json, error, parseDate, formatDate, getNextWeekday } from '../_utils.js';

/**
 * PATCH /api/sessions/[id]
 * Handles:
 * - Scenario D: Marking a session as 'Taken'
 * - Scenario B: Marking a session as 'Missed' with calendar rescheduling & Exam Cutoff rule
 */
export async function onRequestPatch(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const sessionId = parseInt(context.params.id, 10);
    if (!sessionId || isNaN(sessionId)) {
      return error('Invalid session ID.', 400);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }

    const { status } = body;
    if (status !== 'Taken' && status !== 'Missed') {
      return error('Status must be either "Taken" or "Missed".', 400);
    }

    // Fetch existing session and associated student details
    const sessionRecord = await db.prepare(`
      SELECT 
        s.id,
        s.student_id,
        s.scheduled_date,
        s.status,
        s.is_weekend,
        st.name AS student_name,
        st.exam_date
      FROM sessions s
      JOIN students st ON s.student_id = st.id
      WHERE s.id = ?
    `).bind(sessionId).first();

    if (!sessionRecord) {
      return error('Session not found.', 404);
    }

    const studentId = sessionRecord.student_id;
    const previousStatus = sessionRecord.status;

    // --- Scenario D: Taken Weekday/Weekend Class ---
    if (status === 'Taken') {
      await db.prepare(`
        UPDATE sessions 
        SET status = 'Taken' 
        WHERE id = ?
      `).bind(sessionId).run();

      return json({
        success: true,
        session_id: sessionId,
        status: 'Taken',
        message: `Class on ${sessionRecord.scheduled_date} marked as Taken.`
      });
    }

    // --- Scenario B: Missed Weekday Class ---
    if (status === 'Missed') {
      // 1. Update this session to 'Missed'
      await db.prepare(`
        UPDATE sessions 
        SET status = 'Missed' 
        WHERE id = ?
      `).bind(sessionId).run();

      // If it was already missed previously, do not reschedule an additional slot
      if (previousStatus === 'Missed') {
        return json({
          success: true,
          session_id: sessionId,
          status: 'Missed',
          rescheduled: false,
          message: `Session is already marked as Missed.`
        });
      }

      // 2. Find the maximum scheduled_date for this student where status is 'Pending'
      const maxPendingRow = await db.prepare(`
        SELECT MAX(scheduled_date) as max_date 
        FROM sessions 
        WHERE student_id = ? AND status = 'Pending'
      `).bind(studentId).first();

      // Base date: the latest pending session, or if none remaining, the date of the session just missed
      const baseDateStr = maxPendingRow?.max_date || sessionRecord.scheduled_date;
      const baseDate = parseDate(baseDateStr);

      if (!baseDate) {
        return error('Unable to parse base date for rescheduling.', 500);
      }

      // 3. Calculate the next available weekday (Mon-Fri) after that max date
      const nextWeekdayDate = getNextWeekday(baseDate);
      const nextWeekdayStr = formatDate(nextWeekdayDate);

      // 4. Exam Cutoff Rule:
      // If this new date is strictly BEFORE the exam_date, INSERT a new Pending session row.
      // (If it hits or exceeds the exam date limit, do not insert; the session is lost).
      const examDateObj = parseDate(sessionRecord.exam_date);

      if (examDateObj && nextWeekdayDate.getTime() < examDateObj.getTime()) {
        const insertRes = await db.prepare(`
          INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
          VALUES (?, ?, 'Pending', 0)
        `).bind(studentId, nextWeekdayStr).run();

        const newSessionId = insertRes.meta?.last_row_id;

        return json({
          success: true,
          session_id: sessionId,
          status: 'Missed',
          rescheduled: true,
          new_session_id: newSessionId,
          rescheduled_date: nextWeekdayStr,
          message: `Class marked as Missed. Added new makeup class on ${nextWeekdayStr}.`
        });
      } else {
        // Cutoff reached: session cannot be rescheduled
        return json({
          success: true,
          session_id: sessionId,
          status: 'Missed',
          rescheduled: false,
          exam_cutoff_reached: true,
          message: `Class marked as Missed. Could not reschedule: next weekday (${nextWeekdayStr}) reaches or passes exam date (${sessionRecord.exam_date}). This session is lost.`
        });
      }
    }

  } catch (err) {
    return error(`Failed to update session: ${err.message}`, 500);
  }
}
