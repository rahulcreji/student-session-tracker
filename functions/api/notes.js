import { json, error } from './_utils.js';

/**
 * One shared note for the whole website (the teacher's notepad).
 * Stored as a single row (id = 1) in the `notes` table, which is created
 * automatically on first use, so no manual database step is needed.
 *
 * GET /api/notes  -> { success, body, updated_at }
 * PUT /api/notes  { body } -> { success, body, updated_at }
 */
const MAX_LENGTH = 20000;

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT
    )
  `).run();
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    await ensureTable(db);
    const row = await db.prepare(`SELECT body, updated_at FROM notes WHERE id = 1`).first();
    return json({ success: true, body: row?.body || '', updated_at: row?.updated_at || null });
  } catch (err) {
    return error(`Failed to load notes: ${err.message}`, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }
    const text = body?.body;
    if (typeof text !== 'string') return error('Note text is required.', 400);
    if (text.length > MAX_LENGTH) return error(`Notes are too long (max ${MAX_LENGTH} characters).`, 400);

    await ensureTable(db);
    const updatedAt = new Date().toISOString();
    await db.prepare(`
      INSERT INTO notes (id, body, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
    `).bind(text, updatedAt).run();

    return json({ success: true, body: text, updated_at: updatedAt });
  } catch (err) {
    return error(`Failed to save notes: ${err.message}`, 500);
  }
}
