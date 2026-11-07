import { json, error } from './_utils.js';

/**
 * GET /api/health
 * Verifies the D1 binding exists and that both tables are present.
 * The frontend calls this on load and shows a banner if the database is unreachable.
 */
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) {
    return error('Database binding "DB" is missing. Check the [[d1_databases]] section in wrangler.toml.', 500);
  }

  try {
    const { results } = await db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('students', 'sessions')
    `).all();

    const found = new Set((results || []).map(r => r.name));
    const missing = ['students', 'sessions'].filter(t => !found.has(t));

    if (missing.length) {
      return error(
        `Database is connected but table(s) missing: ${missing.join(', ')}. ` +
        'Run: npx wrangler d1 execute student_sessions_db --remote --file=schema.sql',
        500
      );
    }

    return json({ success: true, database: 'connected' });
  } catch (err) {
    return error(`Database query failed: ${err.message}`, 500);
  }
}
