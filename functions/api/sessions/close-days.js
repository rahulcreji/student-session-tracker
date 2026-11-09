import { json, error } from '../_utils.js';
import { validateClientToday } from '../_schedule.js';

/**
 * POST /api/sessions/close-days   body: { "today": "YYYY-MM-DD" }  (teacher's local date)
 *
 * Monday–Friday classes are ATTENDED BY DEFAULT: the teacher only unticks students
 * who did not come (which marks them Missed and adds a makeup via PATCH /api/sessions/:id).
 *
 * So every weekday class that is still Pending on today or an earlier day is marked
 * 'Taken'. Future classes and weekend classes are never touched.
 *
 * The app calls this whenever it opens / refreshes. Safe to call repeatedly or from
 * several tabs at once (each row is updated with a conditional UPDATE).
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

    // How many of them are from earlier days (the app was not opened that day)
    const pastRow = await db.prepare(`
      SELECT COUNT(*) AS n FROM sessions
      WHERE status = 'Pending' AND is_weekend = 0 AND scheduled_date < ?
    `).bind(today).first();

    const res = await db.prepare(`
      UPDATE sessions SET status = 'Taken'
      WHERE status = 'Pending' AND is_weekend = 0 AND scheduled_date <= ?
    `).bind(today).run();

    const marked = res.meta?.changes || 0;
    const fromEarlierDays = Math.min(pastRow?.n || 0, marked);

    return json({
      success: true,
      today,
      marked_attended: marked,
      from_earlier_days: fromEarlierDays,
      message: fromEarlierDays
        ? `${fromEarlierDays} class(es) from earlier days were marked as attended. Untick on the Today page anyone who did not come.`
        : 'Up to date.'
    });
  } catch (err) {
    return error(`Failed to update attendance: ${err.message}`, 500);
  }
}
