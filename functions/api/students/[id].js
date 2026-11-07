import { json, error, parseDate, formatDate } from '../_utils.js';

/**
 * GET /api/students/[id]
 * Fetches student profile, computed metrics, and all sessions
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const studentId = parseInt(context.params.id, 10);
    if (!studentId || isNaN(studentId)) {
      return error('Invalid student ID.', 400);
    }

    const student = await db.prepare(`
      SELECT id, name, start_date, class_time, exam_date, max_sessions
      FROM students
      WHERE id = ?
    `).bind(studentId).first();

    if (!student) {
      return error('Student not found.', 404);
    }

    // Fetch all sessions ordered chronologically
    const { results: sessions } = await db.prepare(`
      SELECT id, student_id, scheduled_date, status, is_weekend
      FROM sessions
      WHERE student_id = ?
      ORDER BY scheduled_date ASC, id ASC
    `).bind(studentId).all();

    // Compute metrics
    const totalSessions = sessions.length;
    const completedCount = sessions.filter(s => s.status === 'Taken').length;
    const missedCount = sessions.filter(s => s.status === 'Missed').length;
    const pendingCount = sessions.filter(s => s.status === 'Pending').length;

    const pendingDates = sessions.filter(s => s.status === 'Pending').map(s => s.scheduled_date);
    const allDates = sessions.map(s => s.scheduled_date);

    const expectedEndDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
    const nextPendingDate = pendingDates.length > 0 ? pendingDates[0] : null;

    // Days until exam
    const today = parseDate(formatDate(new Date()));
    const examDate = parseDate(student.exam_date);
    const daysUntilExam = examDate && today ? Math.round((examDate - today) / (1000 * 60 * 60 * 24)) : null;

    return json({
      success: true,
      student,
      metrics: {
        total_sessions: totalSessions,
        max_sessions: student.max_sessions,
        completed_count: completedCount,
        missed_count: missedCount,
        pending_count: pendingCount,
        expected_end_date: expectedEndDate,
        next_pending_date: nextPendingDate,
        days_until_exam: daysUntilExam
      },
      sessions: sessions || []
    });

  } catch (err) {
    return error(`Failed to load student details: ${err.message}`, 500);
  }
}

/**
 * DELETE /api/students/[id]
 * Deletes a student and their sessions
 */
export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return error('Database binding (DB) is missing.', 500);

    const studentId = parseInt(context.params.id, 10);
    if (!studentId || isNaN(studentId)) {
      return error('Invalid student ID.', 400);
    }

    await db.batch([
      db.prepare(`DELETE FROM sessions WHERE student_id = ?`).bind(studentId),
      db.prepare(`DELETE FROM students WHERE id = ?`).bind(studentId)
    ]);

    return json({
      success: true,
      message: 'Student and associated sessions deleted successfully.'
    });

  } catch (err) {
    return error(`Failed to delete student: ${err.message}`, 500);
  }
}
