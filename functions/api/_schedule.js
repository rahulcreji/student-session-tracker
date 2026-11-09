import { parseDate, formatDate, getNextWeekday } from './_utils.js';

/**
 * Scenario B makeup: append one Pending class on the next free weekday after the
 * student's latest Pending class (or latest class of any status if none are Pending).
 *
 * - Exam Cutoff Rule: only inserted if the date is strictly BEFORE the exam date
 *   (students without an exam date have no cutoff).
 * - Never grows the schedule beyond max_sessions active (non-Missed) classes.
 * - `floorDate` (YYYY-MM-DD, the teacher's "today"): a makeup is always placed AFTER it,
 *   so a makeup never lands on a day that has already passed.
 *
 * `record` needs: student_id, scheduled_date, exam_date.
 * Returns { inserted: true, id, date } or { inserted: false, reason: 'full' | 'exam', date? }.
 */
export async function scheduleMakeup(db, record, maxSessions, floorDate = null) {
  const studentId = record.student_id;

  const activeRow = await db.prepare(`
    SELECT COUNT(*) AS active FROM sessions WHERE student_id = ? AND status != 'Missed'
  `).bind(studentId).first();
  if ((activeRow?.active || 0) >= maxSessions) {
    return { inserted: false, reason: 'full' };
  }

  const baseRow = await db.prepare(`
    SELECT
      (SELECT MAX(scheduled_date) FROM sessions WHERE student_id = ? AND status = 'Pending') AS max_pending,
      (SELECT MAX(scheduled_date) FROM sessions WHERE student_id = ?) AS max_any
  `).bind(studentId, studentId).first();

  let baseDateStr = baseRow?.max_pending || baseRow?.max_any || record.scheduled_date;
  if (floorDate && parseDate(floorDate) && baseDateStr < floorDate) {
    baseDateStr = floorDate;
  }
  const baseDate = parseDate(baseDateStr);
  if (!baseDate) throw new Error('Unable to parse base date for rescheduling.');

  // Skip dates that already hold a class for this student (e.g. the class just missed).
  const { results: laterRows } = await db.prepare(`
    SELECT scheduled_date FROM sessions WHERE student_id = ? AND scheduled_date > ?
  `).bind(studentId, baseDateStr).all();
  const occupied = new Set((laterRows || []).map(r => r.scheduled_date));

  let next = getNextWeekday(baseDate);
  while (occupied.has(formatDate(next))) next = getNextWeekday(next);
  const nextStr = formatDate(next);

  // No exam date (empty) = no cutoff: the makeup is always added.
  const exam = parseDate(record.exam_date);
  if (exam && next.getTime() >= exam.getTime()) {
    return { inserted: false, reason: 'exam', date: nextStr };
  }

  const ins = await db.prepare(`
    INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
    VALUES (?, ?, 'Pending', 0)
  `).bind(studentId, nextStr).run();
  return { inserted: true, id: ins.meta?.last_row_id ?? null, date: nextStr };
}

/**
 * Validates the teacher's local "today" sent by the browser.
 * Accepts only dates within ±1 day of the server's UTC date (covers every time zone),
 * so a wrong device clock can't mark future classes as missed.
 */
export function validateClientToday(todayStr) {
  const d = parseDate(todayStr);
  if (!d) return null;
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((d.getTime() - utcToday) / 86400000);
  return Math.abs(diffDays) <= 1 ? formatDate(d) : null;
}
