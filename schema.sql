-- Cloudflare D1 Database Schema for Student Session Tracker
-- Database Name: student_sessions_db
-- Binding: DB

CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL, 
    class_time TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    max_sessions INTEGER DEFAULT 20
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Taken', or 'Missed'
    is_weekend BOOLEAN DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
