import { json, error, parseDate, formatDate, addDays, isWeekday } from './_utils.js';

/**
 * GET /api/students
 * Lists all students with their aggregate session metrics
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      return error('Database binding (DB) is missing.', 500);
    }

    const query = `
      SELECT 
        s.id,
        s.name,
        s.start_date,
        s.class_time,
        s.exam_date,
        s.max_sessions,
        COALESCE(SUM(CASE WHEN ses.status = 'Taken' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN ses.status = 'Missed' THEN 1 ELSE 0 END), 0) AS missed_count,
        COALESCE(SUM(CASE WHEN ses.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_count,
        COUNT(ses.id) AS total_sessions,
        MAX(ses.scheduled_date) AS expected_end_date,
        MIN(CASE WHEN ses.status = 'Pending' THEN ses.scheduled_date ELSE NULL END) AS next_pending_date
      FROM students s
      LEFT JOIN sessions ses ON s.id = ses.student_id
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE ASC
    `;

    const { results } = await db.prepare(query).all();

    return json({
      success: true,
      students: results || []
    });
  } catch (err) {
    return error(`Failed to fetch students: ${err.message}`, 500);
  }
}

/**
 * POST /api/students
 * Implements Scenario A: Creating a Student & Initial Session Generation
 */
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      return error('Database binding (DB) is missing.', 500);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return error('Invalid JSON body.', 400);
    }

    const { name, start_date, class_time, exam_date } = body;
    const classes_already_finished = Math.max(0, parseInt(body.classes_already_finished, 10) || 0);

    // Validations
    if (!name || typeof name !== 'string' || !name.trim()) {
      return error('Student name is required.', 400);
    }
    if (!class_time || typeof class_time !== 'string' || !class_time.trim()) {
      return error('Class time is required.', 400);
    }

    const startDateObj = parseDate(start_date);
    const examDateObj = parseDate(exam_date);

    if (!startDateObj) {
      return error('Valid start_date (YYYY-MM-DD) is required.', 400);
    }
    if (!examDateObj) {
      return error('Valid exam_date (YYYY-MM-DD) is required.', 400);
    }
    if (startDateObj.getTime() >= examDateObj.getTime()) {
      return error('Start date must be strictly before exam date.', 400);
    }

    const trimmedName = name.trim();
    const trimmedTime = class_time.trim();
    const formattedStartDate = formatDate(startDateObj);
    const formattedExamDate = formatDate(examDateObj);
    const maxSessions = 20;

    // Step 1: Insert student
    const studentInsertRes = await db.prepare(`
      INSERT INTO students (name, start_date, class_time, exam_date, max_sessions)
      VALUES (?, ?, ?, ?, ?)
    `).bind(trimmedName, formattedStartDate, trimmedTime, formattedExamDate, maxSessions).run();

    const studentId = studentInsertRes.meta?.last_row_id;
    if (!studentId) {
      // Fallback query to fetch ID if last_row_id is not exposed
      const lookup = await db.prepare(`
        SELECT id FROM students 
        WHERE name = ? AND start_date = ? AND class_time = ? 
        ORDER BY id DESC LIMIT 1
      `).bind(trimmedName, formattedStartDate, trimmedTime).first();
      if (!lookup) {
        return error('Failed to retrieve created student ID.', 500);
      }
    }
    const finalStudentId = studentId || (await db.prepare(`
      SELECT id FROM students WHERE name = ? ORDER BY id DESC LIMIT 1
    `).bind(trimmedName).first())?.id;

    // Step 2 & 3: Generate sessions for weekdays (Mon-Fri)
    // First N rows are 'Taken', rest are 'Pending'
    // Exam Cutoff Rule: loop MUST stop if it reaches the day of the exam (strictly before exam_date)
    const sessionsToInsert = [];
    let curr = new Date(startDateObj.getTime());

    while (sessionsToInsert.length < maxSessions) {
      // Cutoff: Stop if candidate date is on or after the exam date
      if (curr.getTime() >= examDateObj.getTime()) {
        break;
      }

      if (isWeekday(curr)) {
        const isTaken = sessionsToInsert.length < classes_already_finished;
        sessionsToInsert.push({
          dateStr: formatDate(curr),
          status: isTaken ? 'Taken' : 'Pending',
          is_weekend: 0
        });
      }

      curr = addDays(curr, 1);
    }

    // Step 4: Batch insert all sessions
    if (sessionsToInsert.length > 0) {
      const batchStmts = sessionsToInsert.map(s => 
        db.prepare(`
          INSERT INTO sessions (student_id, scheduled_date, status, is_weekend)
          VALUES (?, ?, ?, ?)
        `).bind(finalStudentId, s.dateStr, s.status, s.is_weekend)
      );

      await db.batch(batchStmts);
    }

    return json({
      success: true,
      student_id: finalStudentId,
      message: `Student created with ${sessionsToInsert.length} session(s) scheduled.`,
      sessions_created: sessionsToInsert.length,
      capped_by_exam: sessionsToInsert.length < maxSessions
    }, 201);

  } catch (err) {
    return error(`Failed to create student: ${err.message}`, 500);
  }
}
