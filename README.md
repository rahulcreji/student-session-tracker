# Student Session Tracker

A responsive web application and daily dashboard for teachers to manage 20-session student courses, track weekday and weekend attendance, and automatically reschedule missed classes up to the exam cutoff date.

Built with **Static HTML5/JS/CSS Frontend**, **Cloudflare Pages Functions**, and **Cloudflare D1 Database**.

---

## 📱 Responsive & Mobile-Ready Design
- **Windows / Desktop**: Multi-column dashboard, sticky navigation, quick modal dialogues, keyboard accessibility (`Esc` to close).
- **Mobile (iOS / Android)**: Touch-friendly tap buttons (minimum 44px), sticky bottom navigation bar, fluid responsive cards, no horizontal scroll.

---

## 🗄️ Database & Cloudflare Configuration

### Cloudflare D1 Database Binding
Configured in `wrangler.toml`:
```toml
name = "student-session-tracker"
compatibility_date = "2026-11-07"
pages_build_output_dir = "public"

[[d1_databases]]
binding = "DB"
database_name = "student_sessions_db"
database_id = "a06c70c4-02e6-4da2-a5a1-7127260b3f88"
```

### Schema
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
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
```

---

## ⚙️ Core Business Scenarios Implemented

1. **Scenario A: Enrolling a Student (Initial Schedule)**
   - Inputs: Name, Start Date, Class Time, Exam Date, Classes Already Finished.
   - Generates up to 20 weekday sessions (Monday–Friday) starting from `start_date`.
   - First *N* sessions are marked `'Taken'`, remaining are `'Pending'`.
   - **Exam Cutoff Rule**: Stops generating dates strictly before `exam_date`.

2. **Scenario B: Missed Weekday Class**
   - Marks the session as `'Missed'`.
   - Calculates the next available weekday after the student's latest pending session.
   - **Exam Cutoff Rule**: If the new date is strictly before `exam_date`, inserts a new makeup `'Pending'` session at the end of the schedule. If it hits or passes the exam date, the session is not scheduled (lost).

3. **Scenario C: Adding a Weekend Class**
   - Adds a Saturday or Sunday session marked as `'Taken'` (`is_weekend = 1`).
   - Automatically removes the student's *very last* scheduled pending session to keep total session count capped at 20.

4. **Scenario D: Taken Weekday Class**
   - Marks the session as `'Taken'`. No date shifts occur.

---

## 🚀 Deployment Guide (GitHub to Cloudflare Pages)

### Step 1: Initialize Git and Push to GitHub

In your project directory (`c:\Users\rahulr\soniya_fluxre`):

```bash
# Initialize git repository
git init

# Stage all files
git add .

# Initial commit
git commit -m "Initial commit: Student Session Tracker with Cloudflare Pages Functions and responsive UI"

# Create a new repository on GitHub (via GitHub UI or GitHub CLI), then link it:
git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/<YOUR-REPO-NAME>.git
git branch -M main
git push -u origin main
```

---

### Step 2: Connect GitHub to Cloudflare Pages

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your GitHub repository (`<YOUR-REPO-NAME>`).
4. Configure Build & Deployment settings:
   - **Project name:** `student-session-tracker` (or your preferred name)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
5. Click **Save and Deploy**.

---

### Step 3: Link the D1 Database to Cloudflare Pages

Even with `wrangler.toml`, Cloudflare Pages git deployments require linking the D1 binding in the dashboard settings:

1. In the Cloudflare Dashboard, open your newly created Pages project: **Workers & Pages** -> **student-session-tracker**.
2. Go to **Settings** -> **Functions** -> **D1 database bindings**.
3. Click **Add binding**:
   - **Variable name:** `DB`
   - **D1 database:** Select `student_sessions_db` (ID: `a06c70c4-02e6-4da2-a5a1-7127260b3f88`)
4. Click **Save**.
5. Trigger a new deployment (or go to **Deployments** -> click the latest deployment -> **Retry deployment**) so the binding takes effect.

Your site is now live with full serverless functionality!

---

## 📁 Directory Structure
```
├── functions/
│   └── api/
│       ├── _utils.js            # Shared date math and response helpers
│       ├── dashboard.js         # GET /api/dashboard
│       ├── students.js          # GET & POST /api/students
│       ├── students/
│       │   └── [id].js          # GET & DELETE /api/students/:id
│       └── sessions/
│           ├── [id].js          # PATCH /api/sessions/:id (Taken / Missed)
│           └── weekend.js       # POST /api/sessions/weekend
├── public/
│   ├── css/
│   │   └── style.css            # Responsive styles (Desktop & Mobile)
│   ├── js/
│   │   └── app.js               # Client application logic
│   └── index.html               # Main single page application
├── .gitignore
├── README.md
├── schema.sql                   # SQL schema reference
└── wrangler.toml                # Cloudflare configuration
```
