import { json, error } from './_utils.js';

/**
 * GET /api/schedule
 * Every student and every class, for the all-students Schedule view
 * (dates + class times from the start of each course until it finishes).
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const [studentsRes, sessionsRes] = await db.batch([
      db.prepare(`
        SELECT id, name, start_date, class_time, exam_date, max_sessions
        FROM students
        ORDER BY name COLLATE NOCASE ASC
      `),
      db.prepare(`
        SELECT id, student_id, scheduled_date, status, is_weekend
        FROM sessions
        ORDER BY scheduled_date ASC, id ASC
      `)
    ]);

    return json({
      success: true,
      students: studentsRes.results || [],
      sessions: sessionsRes.results || []
    });
  } catch (err) {
    return error(`Failed to load schedule: ${err.message}`, 500);
  }
}
