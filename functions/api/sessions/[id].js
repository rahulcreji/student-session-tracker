import { json, error } from '../_utils.js';
import { scheduleMakeup, validateClientToday } from '../_schedule.js';

const STATUSES = ['Pending', 'Taken', 'Missed'];

/**
 * PATCH /api/sessions/[id]   body: { "status": "Taken" | "Missed" | "Pending" }
 *
 * Normal daily marking:
 * - Scenario D: Pending -> Taken. No dates shift.
 * - Scenario B: Pending -> Missed. A makeup Pending session is appended on the next
 *   free weekday after the student's latest Pending session, but ONLY if that date
 *   is strictly before the exam date (otherwise the session is lost).
 *
 * Corrections (teacher fixes a past day):
 * - Taken  -> Pending : undo. No dates shift.
 * - Taken  -> Missed  : same as Scenario B (makeup appended if it fits).
 * - Missed -> Taken / Pending : the class is given back, so the makeup is taken away:
 *   if the student now has more than max_sessions active (non-Missed) classes,
 *   their last Pending session is deleted (same as Scenario C's "delete last pending").
 *
 * Optional body field "today" (teacher's local YYYY-MM-DD): makeups are always placed after it.
 *
 * Every update is conditional on the status we just read, so a double-click or two
 * open tabs can never apply the same change twice.
 * Weekend classes (Scenario C) are not changed through this endpoint.
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

    const { status } = body || {};
    if (!STATUSES.includes(status)) {
      return error('Status must be "Taken", "Missed" or "Pending".', 400);
    }

    const record = await db.prepare(`
      SELECT s.id, s.student_id, s.scheduled_date, s.status, s.is_weekend,
             st.name AS student_name, st.exam_date, st.max_sessions
      FROM sessions s
      JOIN students st ON s.student_id = st.id
      WHERE s.id = ?
    `).bind(sessionId).first();

    if (!record) {
      return error('Session not found. It may have been removed — please refresh.', 404);
    }
    if (record.is_weekend) {
      return error('Weekend classes cannot be changed here.', 400);
    }
    if (record.status === status) {
      return error(`This class is already marked as ${status}.`, 409);
    }

    const previous = record.status;
    const studentId = record.student_id;
    const maxSessions = record.max_sessions || 20;
    const who = record.student_name;
    const day = record.scheduled_date;

    // Conditional update: only succeeds if nobody changed the row since we read it.
    const updateRes = await db.prepare(`
      UPDATE sessions SET status = ? WHERE id = ? AND status = ?
    `).bind(status, sessionId, previous).run();

    if (!updateRes.meta || updateRes.meta.changes === 0) {
      return error('This class was just updated by another request. Please refresh.', 409);
    }

    const base = { success: true, session_id: sessionId, status, previous_status: previous };

    // ---------- Restoring a missed class (Missed -> Taken / Pending) ----------
    if (previous === 'Missed') {
      const activeRow = await db.prepare(`
        SELECT COUNT(*) AS active FROM sessions WHERE student_id = ? AND status != 'Missed'
      `).bind(studentId).first();

      let removed = null;
      if ((activeRow?.active || 0) > maxSessions) {
        const lastPending = await db.prepare(`
          SELECT id, scheduled_date FROM sessions
          WHERE student_id = ? AND status = 'Pending' AND id != ?
          ORDER BY scheduled_date DESC, id DESC
          LIMIT 1
        `).bind(studentId, sessionId).first();

        if (!lastPending) {
          // Nothing to take away -> undo our change and refuse.
          await db.prepare(`UPDATE sessions SET status = 'Missed' WHERE id = ?`).bind(sessionId).run();
          return error(`${who} already has ${maxSessions} classes, so this missed class can't be restored.`, 409);
        }
        await db.prepare(`DELETE FROM sessions WHERE id = ? AND status = 'Pending'`).bind(lastPending.id).run();
        removed = lastPending;
      }

      const label = status === 'Taken' ? 'Completed' : 'not marked';
      return json({
        ...base,
        removed_pending_session: removed,
        message: `${who}: class on ${day} changed from Missed to ${label}.` +
          (removed ? ` The extra class on ${removed.scheduled_date} was removed to keep the total at ${maxSessions}.` : '')
      });
    }

    // ---------- Pending/Taken -> Missed (Scenario B) ----------
    if (status === 'Missed') {
      const makeup = await scheduleMakeup(db, record, maxSessions, validateClientToday(body.today));
      const prefix = previous === 'Taken' ? `class on ${day} changed from Completed to Missed.` : `class on ${day} marked as Missed.`;
      if (makeup.inserted) {
        return json({
          ...base,
          rescheduled: true,
          new_session_id: makeup.id,
          rescheduled_date: makeup.date,
          message: `${who}: ${prefix} Makeup class added on ${makeup.date}.`
        });
      }
      return json({
        ...base,
        rescheduled: false,
        exam_cutoff_reached: makeup.reason === 'exam',
        message: makeup.reason === 'exam'
          ? `${who}: ${prefix} No makeup possible — the next free weekday (${makeup.date}) is not before the exam (${record.exam_date}). This session is lost.`
          : `${who}: ${prefix} No makeup needed — the schedule already has ${maxSessions} classes.`
      });
    }

    // ---------- Pending -> Taken (Scenario D) or Taken -> Pending (undo) ----------
    return json({
      ...base,
      message: status === 'Taken'
        ? `${who}: class on ${day} marked as Completed.`
        : `${who}: class on ${day} changed back to not marked.`
    });
  } catch (err) {
    return error(`Failed to update session: ${err.message}`, 500);
  }
}


/**
 * DELETE /api/sessions/[id]?today=YYYY-MM-DD
 * Untick an extra weekend class (the reverse of Scenario C):
 * the weekend class is deleted and the class it replaced is given back as one
 * Pending class at the end of the schedule (next free weekday, before the exam if any).
 * Only weekend classes can be removed; weekday classes are ticked/unticked with PATCH.
 */
export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const sessionId = parseInt(context.params.id, 10);
    if (!sessionId || isNaN(sessionId)) {
      return error('Invalid session ID.', 400);
    }
    const today = validateClientToday(new URL(context.request.url).searchParams.get('today'));

    const record = await db.prepare(`
      SELECT s.id, s.student_id, s.scheduled_date, s.status, s.is_weekend,
             st.name AS student_name, st.exam_date, st.max_sessions
      FROM sessions s
      JOIN students st ON s.student_id = st.id
      WHERE s.id = ?
    `).bind(sessionId).first();

    if (!record) {
      return error('This class was already removed. Please refresh.', 404);
    }
    if (!record.is_weekend) {
      return error('Only extra weekend classes can be removed. Weekday classes are unticked instead.', 400);
    }

    const del = await db.prepare(`DELETE FROM sessions WHERE id = ? AND is_weekend = 1`).bind(sessionId).run();
    if (!del.meta || del.meta.changes === 0) {
      return error('This class was already removed. Please refresh.', 409);
    }

    const makeup = await scheduleMakeup(db, record, record.max_sessions || 20, today);
    return json({
      success: true,
      removed_session_id: sessionId,
      restored_date: makeup.inserted ? makeup.date : null,
      message: makeup.inserted
        ? `${record.student_name}: weekend class on ${record.scheduled_date} removed. Their class on ${makeup.date} is back on the schedule.`
        : `${record.student_name}: weekend class on ${record.scheduled_date} removed.`
    });
  } catch (err) {
    return error(`Failed to remove class: ${err.message}`, 500);
  }
}
