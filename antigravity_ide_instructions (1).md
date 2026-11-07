# Project: Student Session Tracker
**Tech Stack:** Static HTML/JS/CSS Frontend + Cloudflare Functions + Cloudflare D1 Database.

## 1. Project Goal
Build a daily dashboard for a teacher to track student sessions. Each student gets a maximum of 20 sessions (Monday-Friday). The teacher uses a daily UI to mark classes as "Taken" or "Missed", and the calendar automatically recalculates their schedule based on specific business rules.

## 2. Cloudflare Configuration
The project will be deployed to Cloudflare Pages.
Create a `wrangler.toml` file in the root directory with the following content to bind the D1 database. Ensure this exact file is created:

```toml
name = "student-session-tracker"
compatibility_date = "2026-11-07"

[[d1_databases]]
binding = "DB"
database_name = "student_sessions_db"
database_id = "a06c70c4-02e6-4da2-a5a1-7127260b3f88"
```

## 3. Database Schema
The database is already created in Cloudflare D1. Do not write migrations, but assume this schema exists when writing the backend SQL queries. Use `context.env.DB.prepare(...)` for all queries.

```sql
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL, 
    class_time TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    max_sessions INTEGER DEFAULT 20
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Taken', or 'Missed'
    is_weekend BOOLEAN DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id)
);
```

## 4. Business Logic & Scenarios (CRITICAL)
The Cloudflare Functions API must strictly handle the following rules when updating or generating sessions.

### Scenario A: Creating a Student (Initial Generation)
* **Input:** `name`, `start_date`, `class_time`, `exam_date`, and `classes_already_finished` (default 0).
* **Action:** 
  1. Insert the student into the `students` table.
  2. Loop through weekdays (Mon-Fri) starting from `start_date`.
  3. Insert up to 20 rows into the `sessions` table. 
  4. The first `N` rows (where `N` = `classes_already_finished`) are inserted with status `'Taken'`. The rest are `'Pending'`.
  5. **Exam Cutoff Rule:** The loop MUST stop generating dates if it reaches the day before the `exam_date`.

### Scenario B: Missed Weekday Class
* **Trigger:** Teacher marks a Pending session as "Missed".
* **Action:**
  1. Update that session's status to `'Missed'`.
  2. Find the maximum `scheduled_date` for this student where status is `'Pending'`.
  3. Calculate the next available weekday (Mon-Fri) after that max date.
  4. **Exam Cutoff Rule:** If this new date is strictly BEFORE the `exam_date`, `INSERT` a new `Pending` session row at the end of the calendar. (If it hits the exam date limit, do not insert a new row; the session is lost).

### Scenario C: Teacher Adds a Weekend Class
* **Trigger:** Teacher explicitly adds a class on a Saturday or Sunday.
* **Action:**
  1. `INSERT` a new row for that specific weekend date with status `'Taken'` and `is_weekend = True`.
  2. To keep the total session count capped at 20, find the student's *very last* scheduled `Pending` session in the database (Max scheduled_date where status='Pending') and `DELETE` it.

### Scenario D: Taken Weekday Class
* **Trigger:** Teacher marks a Pending session as "Taken".
* **Action:** Update that specific session's status to `'Taken'`. No dates shift.

## 5. UI Requirements (Frontend)
Build a clean, modern HTML/JS interface (Vanilla JS, no heavy frameworks) with the following views:

1. **Daily Dashboard:** Shows today's date and a list/dropdown of students who have a `Pending` class scheduled for today. The teacher can quickly click "Taken" or "Missed" for each.
2. **Add Student Modal:** Form to capture Name, Start Date, Class Time, Exam Date, and "Classes Already Finished" (number input).
3. **Student Profile/Calendar:** Shows the calculated metrics (Sessions Left, Completed, Missed, Expected End Date) by querying the `sessions` table. It renders a list/calendar view of all 20 of their sessions. Includes a button to "Add Weekend Class".
4. **API Connectivity:** All frontend fetch calls should point to `/api/...` which maps to the Cloudflare Functions directory (e.g., `functions/api/students.js`, `functions/api/sessions.js`).