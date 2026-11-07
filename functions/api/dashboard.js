import { json, error, formatDate } from './_utils.js';

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      return error('Database binding (DB) is missing. Check wrangler.toml and Cloudflare Pages settings.', 500);
    }

    const url = new URL(context.request.url);
    let targetDate = url.searchParams.get('date');

    // Default to current date in UTC if not provided or invalid
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      targetDate = formatDate(new Date());
    }

    // Fetch all sessions on target date with student details
    const stmt = db.prepare(`
      SELECT 
        s.id AS session_id,
        s.student_id,
        s.scheduled_date,
        s.status,
        s.is_weekend,
        st.name AS student_name,
        st.class_time,
        st.start_date,
        st.exam_date,
        st.max_sessions,
        (SELECT COUNT(*) FROM sessions WHERE student_id = st.id AND status = 'Taken') AS completed_count,
        (SELECT COUNT(*) FROM sessions WHERE student_id = st.id AND status = 'Missed') AS missed_count,
        (SELECT COUNT(*) FROM sessions WHERE student_id = st.id AND status = 'Pending') AS pending_count,
        (SELECT COUNT(*) FROM sessions WHERE student_id = st.id) AS total_sessions,
        -- Position of this class among the student's active (non-Missed) classes: "class 9 of 20"
        (SELECT COUNT(*) FROM sessions x
          WHERE x.student_id = s.student_id AND x.status != 'Missed'
            AND (x.scheduled_date < s.scheduled_date OR (x.scheduled_date = s.scheduled_date AND x.id <= s.id))
        ) AS class_number
      FROM sessions s
      JOIN students st ON s.student_id = st.id
      WHERE s.scheduled_date = ?
      ORDER BY st.class_time ASC, st.name ASC
    `);

    const { results } = await stmt.bind(targetDate).all();

    // Summary counts for this date
    const summary = {
      total: results.length,
      pending: results.filter(r => r.status === 'Pending').length,
      taken: results.filter(r => r.status === 'Taken').length,
      missed: results.filter(r => r.status === 'Missed').length,
    };

    return json({
      success: true,
      date: targetDate,
      summary,
      sessions: results || []
    });
  } catch (err) {
    return error(`Failed to load dashboard: ${err.message}`, 500);
  }
}

