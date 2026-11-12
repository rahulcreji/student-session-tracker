# Student Session Tracker

A daily dashboard for a teacher to track 20-session student courses: tick the students who attended each day, see every student's upcoming classes on a week-by-week schedule, add **weekend** classes, and let the schedule recalculate automatically up to each student's exam date.

**Stack:** static HTML/CSS/Vanilla JS (`public/`) · Cloudflare Worker API (`src/index.js` → `functions/api/`) · Cloudflare D1 database (`DB` binding).

Live: https://student-session-tracker.the-language-formula.workers.dev

---

## Business rules

| Scenario | Trigger | What happens |
|---|---|---|
| **A – Enroll student** | Add Student form | Up to 20 Mon–Fri classes from `start_date` at the student's class time. First *N* (`classes_already_finished`) are `Taken`, rest `Pending`. Only dates **strictly before** `exam_date` are generated. `exam_date` is **optional**: left empty it is stored as `''` and no exam cutoff applies anywhere (generation, makeups, weekend classes). **Already started:** the form sends `next_class_date` + *N* instead of `start_date`; the start date is set *N* weekdays before the next class, so the *N* finished classes are recorded just before it and the remaining 20 − *N* run Mon–Fri from the next class date. The new student's classes appear on the **Schedule** straight away (highlighted). |
| **B – Missed** | Teacher unticks a weekday class | One makeup `Pending` class is added on the next free weekday after the latest Pending class (never on a day that has already passed) — **only if** that date is before the exam; otherwise the session is lost. |
| **C – Weekend class** | Ticking a student on Saturday/Sunday on the Today page (or “Add Weekend Class” on the profile). Unticking removes it again (`DELETE /api/sessions/:id`) and gives the last class back | Sat/Sun row inserted as `Taken` (`is_weekend = 1`) and the student’s last `Pending` class is deleted (one atomic batch), so one class disappears from the end of the Schedule. |
| **D – Taken** | Student ticked | Session → `Taken`. No dates move. |

### Daily workflow

1. **Today** page → **Monday–Friday classes are ticked (attended) by default.** When the app opens, every weekday
   class still `Pending` on today or an earlier day is marked `Taken` (`POST /api/sessions/close-days`, using the
   teacher's local date).
2. The teacher **unticks** students who did not come → `Missed` straight away and a makeup class is added at the end
   (Scenario B). Ticking again gives the class back. On Saturday/Sunday everyone starts unticked; ticking adds an
   extra class (Scenario C).
3. **Schedule** page → a weekly timetable (Mon–Fri, no dates) of every student with classes left at their usual class time, with free gaps (7 AM–9 PM) shown and listed, a Copy button for the free times, and a class-length setting.

### Correcting a past day

Pick the date on the **Today** page and tick/untick:

| Change | Effect on the schedule |
|---|---|
| Untick an attended class | Becomes Missed → makeup added (Scenario B) |
| Tick a missed class | The class is given back, so if the student now has more than 20 active classes their last pending class (the makeup) is deleted. If the miss had been lost to the exam cutoff, nothing is deleted. |

Future days can’t be ticked, and weekend classes aren’t changed from the checklist. Every update is conditional on the status that was just read, so double-clicks or two open tabs can’t apply a change twice or create duplicate makeup classes. Changes that move dates ask for confirmation.

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Checks the D1 binding and that both tables exist |
| GET | `/api/dashboard?date=YYYY-MM-DD` | Classes on a date (+ class number and per-student counts) |
| GET | `/api/schedule` | All students and all classes (Schedule view) |
| GET / POST | `/api/students` | List students with metrics / create student (Scenario A) |
| GET / PATCH / DELETE | `/api/students/:id` | Profile + all sessions / edit name, class time, exam date (`remove_after_exam` to confirm removing classes past a new exam) and `classes_attended` (extra/fewer classes taken off/added at the end) / delete student and sessions |
| PATCH | `/api/sessions/:id` | `{ "status": "Taken" \| "Missed" \| "Pending" }` (Scenarios D / B, and corrections) |
| POST | `/api/sessions/weekend` | `{ "student_id", "date" }` (Scenario C) |
| POST | `/api/sessions/close-days` | `{ "today" }` — weekday classes up to today that are still Pending become attended (default) |

All responses are JSON: `{ "success": true, ... }` or `{ "success": false, "error": "..." }`.

The app always talks to D1. There is **no** offline/localStorage fallback, so data you see is always what is in the database. If the database can’t be reached, a red banner appears at the top of the page.

---

## Deploy (Cloudflare Workers, Git-connected)

The repository is connected to a Cloudflare Worker whose build runs `npx wrangler deploy`. Pushing to `main` deploys automatically. `wrangler.toml` configures:

- `main = "src/index.js"`: the API Worker
- `[assets] directory = "./public"`: static frontend; `run_worker_first = ["/api/*"]` sends only API calls to the Worker
- `[[d1_databases]] binding = "DB"`: `student_sessions_db` (`a06c70c4-02e6-4da2-a5a1-7127260b3f88`)

### One-time: create the tables (only if the database is new/empty of tables)

```bash
npx wrangler d1 execute student_sessions_db --remote --file=schema.sql
```

`schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so running it again is harmless.

### Check the connection

Open `https://<your-worker-url>/api/health`. It should return `{"success":true,"database":"connected"}`.

### Run locally

```bash
npx wrangler d1 execute student_sessions_db --local --file=schema.sql   # first time only
npx wrangler dev                                                        # http://localhost:8787
```

`wrangler dev` uses a local copy of D1, so testing never touches production data.

> ⚠️ The app has no login. Anyone with the URL can view and change data. To restrict it, put the Worker behind **Cloudflare Access** (Zero Trust → Access → Applications → add your `workers.dev` hostname). This needs no code changes.

---

## Directory structure

```
├── src/index.js                 # Worker entry: routes /api/* to the handlers below
├── functions/api/
│   ├── _utils.js                # JSON helpers + UTC date math
│   ├── _schedule.js             # Shared makeup-class logic (Scenario B)
│   ├── schedule.js              # GET /api/schedule
│   ├── health.js                # GET /api/health
│   ├── dashboard.js             # GET /api/dashboard
│   ├── students.js              # GET, POST /api/students        (Scenario A)
│   ├── students/[id].js         # GET, DELETE /api/students/:id
│   └── sessions/
│       ├── [id].js              # PATCH /api/sessions/:id        (Scenarios B, D + corrections)
│       ├── close-days.js        # POST /api/sessions/close-days  (default: attended)
│       └── weekend.js           # POST /api/sessions/weekend     (Scenario C)
├── public/                      # Static frontend (index.html, css/, js/)
├── schema.sql                   # D1 schema
└── wrangler.toml                # Worker + assets + D1 config
```

The `functions/api` layout also matches Cloudflare Pages Functions file-based routing, so the same handlers would work on Pages.
