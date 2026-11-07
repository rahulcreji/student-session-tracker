import { json, error } from '../_utils.js';
import { scheduleMakeup, validateClientToday } from '../_schedule.js';

/**
 * POST /api/sessions/close-days   body: { "today": "YYYY-MM-DD" }  (teacher's local date)
 *
 * "If the teacher didn't tick a student, the class was not taken."
 * Every weekday class still Pending on a day BEFORE today becomes 'Missed' and gets a
 * makeup class at the end of the schedule (Scenario B, including the Exam Cutoff Rule).
 * Today's classes are never touched — the teacher can still tick them until the day ends.
 *
 * Called by the app whenever it opens / refreshes. Safe to call repeatedly or from
 * several tabs at once: each class is closed with a conditional UPDATE, so only one
 * request can close it and add its makeup.
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

    const today = validateClientToday(body?.today);
    if (!today) {
      return error('A valid "today" (YYYY-MM-DD) close to the current date is required. Check the device clock.', 400);
    }

    const { results: overdue } = await db.prepare(`
      SELECT s.id, s.student_id, s.scheduled_date,
             st.name AS student_name, st.exam_date, st.max_sessions
      FROM sessions s
      JOIN students st ON st.id = s.student_id
      WHERE s.status = 'Pending' AND s.is_weekend = 0 AND s.scheduled_date < ?
      ORDER BY s.scheduled_date ASC, s.id ASC
      LIMIT 500
    `).bind(today).all();

    const details = [];
    for (const row of overdue || []) {
      const upd = await db.prepare(`
        UPDATE sessions SET status = 'Missed' WHERE id = ? AND status = 'Pending'
      `).bind(row.id).run();
      if (!upd.meta || upd.meta.changes === 0) continue; // another request closed it first

      const makeup = await scheduleMakeup(db, row, row.max_sessions || 20, today);
      details.push({
        session_id: row.id,
        student_id: row.student_id,
        student_name: row.student_name,
        date: row.scheduled_date,
        makeup_date: makeup.inserted ? makeup.date : null,
        lost: !makeup.inserted && makeup.reason === 'exam'
      });
    }

    const added = details.filter(d => d.makeup_date).length;
    const lost = details.filter(d => d.lost).length;
    return json({
      success: true,
      today,
      closed: details.length,
      makeups_added: added,
      lost,
      details,
      message: details.length
        ? `${details.length} unticked class(es) from earlier days counted as missed. ${added} makeup class(es) added` +
          (lost ? `, ${lost} lost to the exam cutoff.` : '.')
        : 'Nothing to close.'
    });
  } catch (err) {
    return error(`Failed to close past days: ${err.message}`, 500);
  }
}
