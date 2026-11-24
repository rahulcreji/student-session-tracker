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


-- One shared note for the whole website (also created automatically by /api/notes)
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    body TEXT NOT NULL DEFAULT '',
    updated_at TEXT
);

-- Money received from students (also created automatically by /api/earnings)
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    student_name TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_date);

-- App settings, e.g. coaching_start_date (also created automatically)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
