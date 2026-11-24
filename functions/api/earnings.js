import { json, error, parseDate, formatDate } from './_utils.js';

/**
 * Earnings: money received from students, and the date the coaching centre started
 * (used for the monthly average). Both tables are created automatically on first use,
 * so no manual database step is needed.
 *
 * GET    /api/earnings               -> { start_date, payments: [...] }
 * PUT    /api/earnings/start-date    { start_date }         ('' clears it)
 * POST   /api/payments               { student_id, amount, paid_date, note? }
 * PATCH  /api/payments/:id           { student_id?, amount?, paid_date?, note? }
 * DELETE /api/payments/:id
 *
 * A payment keeps the student's name, so it stays in the records even if the
 * student is later deleted.
 */
const MAX_AMOUNT = 100000000; // 10 crore: guards against typing mistakes
const MAX_NOTE = 200;

async function ensureTables(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        student_name TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_date)`),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
  ]);
}

function parseAmount(raw) {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
  if (!isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

// Validates the fields of a payment; `partial` allows missing fields (for edits)
async function readPaymentFields(db, body, partial) {
  const out = {};

  if (!partial || body.student_id !== undefined) {
    const sid = parseInt(body.student_id, 10);
    if (!sid) return { err: 'Please choose a student.' };
    const st = await db.prepare(`SELECT id, name FROM students WHERE id = ?`).bind(sid).first();
    if (!st) return { err: 'That student was not found.' };
    out.student_id = st.id;
    out.student_name = st.name;
  }

  if (!partial || body.amount !== undefined) {
    const amount = parseAmount(body.amount);
    if (amount === null) return { err: 'Amount must be a number greater than 0.' };
    out.amount = amount;
  }

  if (!partial || body.paid_date !== undefined) {
    const d = parseDate(body.paid_date);
    if (!d) return { err: 'Please choose the date you received the money.' };
    out.paid_date = formatDate(d);
  }

  if (body.note !== undefined) {
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > MAX_NOTE) return { err: `Note must be ${MAX_NOTE} characters or fewer.` };
    out.note = note;
  }

  return { fields: out };
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

// GET /api/earnings
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    await ensureTables(db);
    const [startRes, paymentsRes] = await db.batch([
      db.prepare(`SELECT value FROM settings WHERE key = 'coaching_start_date'`),
      db.prepare(`
        SELECT id, student_id, student_name, amount, paid_date, note
        FROM payments ORDER BY paid_date DESC, id DESC
      `)
    ]);
    return json({
      success: true,
      start_date: startRes.results?.[0]?.value || '',
      payments: paymentsRes.results || []
    });
  } catch (err) {
    return error(`Failed to load earnings: ${err.message}`, 500);
  }
}

// PUT /api/earnings/start-date
export async function onRequestPutStartDate(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    const body = await readBody(context.request);
    if (!body) return error('Invalid JSON body.', 400);

    await ensureTables(db);
    const raw = typeof body.start_date === 'string' ? body.start_date.trim() : '';
    if (!raw) {
      await db.prepare(`DELETE FROM settings WHERE key = 'coaching_start_date'`).run();
      return json({ success: true, start_date: '' });
    }
    const d = parseDate(raw);
    if (!d) return error('Start date must be a valid date.', 400);
    // Allow up to one day ahead (time zones), never a future start
    if (d.getTime() > Date.now() + 86400000) return error('The start date cannot be in the future.', 400);

    const value = formatDate(d);
    await db.prepare(`
      INSERT INTO settings (key, value) VALUES ('coaching_start_date', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).bind(value).run();
    return json({ success: true, start_date: value });
  } catch (err) {
    return error(`Failed to save the start date: ${err.message}`, 500);
  }
}

// POST /api/payments
export async function onRequestPostPayment(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    const body = await readBody(context.request);
    if (!body) return error('Invalid JSON body.', 400);

    await ensureTables(db);
    const { fields, err } = await readPaymentFields(db, body, false);
    if (err) return error(err, 400);

    const res = await db.prepare(`
      INSERT INTO payments (student_id, student_name, amount, paid_date, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(fields.student_id, fields.student_name, fields.amount, fields.paid_date, fields.note || '', new Date().toISOString()).run();

    return json({ success: true, payment: { id: res.meta?.last_row_id ?? null, note: '', ...fields } }, 201);
  } catch (err) {
    return error(`Failed to save the payment: ${err.message}`, 500);
  }
}

// PATCH /api/payments/:id
export async function onRequestPatchPayment(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    const id = parseInt(context.params.id, 10);
    if (!id) return error('Invalid payment ID.', 400);
    const body = await readBody(context.request);
    if (!body) return error('Invalid JSON body.', 400);

    await ensureTables(db);
    const existing = await db.prepare(`SELECT * FROM payments WHERE id = ?`).bind(id).first();
    if (!existing) return error('Payment not found.', 404);

    // Keep the stored name if the student was deleted and the student wasn't changed
    if (body.student_id !== undefined && parseInt(body.student_id, 10) === existing.student_id) {
      const stillThere = await db.prepare(`SELECT id FROM students WHERE id = ?`).bind(existing.student_id).first();
      if (!stillThere) delete body.student_id;
    }

    const { fields, err } = await readPaymentFields(db, body, true);
    if (err) return error(err, 400);
    const updated = { ...existing, ...fields };

    await db.prepare(`
      UPDATE payments SET student_id = ?, student_name = ?, amount = ?, paid_date = ?, note = ? WHERE id = ?
    `).bind(updated.student_id, updated.student_name, updated.amount, updated.paid_date, updated.note || '', id).run();

    return json({ success: true, payment: updated });
  } catch (err) {
    return error(`Failed to update the payment: ${err.message}`, 500);
  }
}

// DELETE /api/payments/:id
export async function onRequestDeletePayment(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);
    const id = parseInt(context.params.id, 10);
    if (!id) return error('Invalid payment ID.', 400);

    await ensureTables(db);
    const res = await db.prepare(`DELETE FROM payments WHERE id = ?`).bind(id).run();
    if (!res.meta?.changes) return error('Payment not found.', 404);
    return json({ success: true });
  } catch (err) {
    return error(`Failed to delete the payment: ${err.message}`, 500);
  }
}
