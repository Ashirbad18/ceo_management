# CMAS — CEO Management Action System

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Deploy to Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com/)

An executive management and accountability platform designed for CEOs and Executive Management Assistants. CMAS unifies daily meeting management, automated follow-up reviews of earlier meetings, departmental responsibility tracking, and PDF/CSV reporting into a single, lightweight application.

---

## Key Executive Features

### 1. Daily CEO Register (Date-Based Meeting Management)
* **Dedicated Day View:** Exclusively displays meetings scheduled or held on the selected date (defaults to the current day). Historical meetings are kept separate so the CEO's daily agenda stays clean and actionable.
* **Date Navigation Bar:** Step through records with `Previous Day`, `Today`, `Next Day`, or jump to any specific date via the calendar date picker.
* **Comprehensive Meeting Records:** Displays time, department, meeting type, attendees, location, key discussion points, agreed decisions, and assigned action items.
* **Direct Record Management:** Inline **Edit** and **Delete** actions (with confirmation dialog) for any meeting record.
* **Executive Journal:** Record quick briefings, phone discussions, and informal CEO observations for the day.

### 2. Dedicated Section — Previous Meeting Review
* **Automated Milestone Identification:** Automatically surfaces tasks assigned during earlier meetings whose scheduled review date has arrived. The CEO never has to manually search through past records.
* **Complete Context at a Glance:**
  * **Original Meeting:** Originating meeting date, elapsed days, attendees, location, and meeting decisions.
  * **Department:** Filter and identify which operational department is involved.
  * **Assigned Deliverable:** Task title, specific action required, and current progress percentage.
  * **Ownership:** Primary owner (*Assigned to*) and department authority (*Accountable*).
  * **Review Context:** Clear reason explaining why the task requires executive review today.
* **Filter Tabs:**
  * `Due Today` — Primary focus on reviews scheduled for the current date.
  * `Overdue Reviews` — Action items past their review date that remain incomplete.
  * `Upcoming Reviews` — Follow-up reviews coming in future days.
  * `All Pending Reviews` — Complete register of open review milestones.
  * `Completed Reviews` — Archive of finished deliverables.
* **Review & Follow-Up Action:** Single-click modal allowing the CEO to update progress %, adjust status, record review notes, and schedule the next review milestone.

### 3. Meetings Repository (All & Historical Meetings)
* Complete archive of all past, present, and scheduled meetings across all 12 operational departments.
* Searchable by meeting attendees, department, and decision keywords.

### 4. Central Action Tracker
* Real-time accountability matrix across all departments.
* Track ownership, progress bars, priority levels (`Low`, `Medium`, `High`, `Critical`), deadlines, and review dates.

### 5. Reporting & Exports
* Instant **CSV** and **PDF** downloads for:
  * Central Action Tracker
  * Previous Meeting Reviews

---

## Project Structure

```text
cmas/
├── app.py                # Unified FastAPI server, SQLite models & UI host
├── data/                 # SQLite persistent database storage (cmas.db)
├── frontend/
│   ├── src/
│   │   ├── main.tsx      # React + TypeScript source code
│   │   └── styles.css    # Responsive executive styling
│   └── dist/
│       └── index.html    # Pre-bundled single-page app
├── requirements.txt      # Python dependencies
├── render.yaml           # 1-Click Render cloud deployment blueprint
├── Dockerfile            # Multi-stage production container
├── docker-compose.yml    # Single service deployment
└── README.md
```

---

## Quick Start (Local Run)

Only standard **Python 3.10+** is required. No Node.js or Docker needed.

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```
*(On Windows, you can also run: `python -m pip install -r requirements.txt`)*

### 2. Run the App
```bash
python app.py
```

### What Happens Automatically:
1. SQLite database (`data/cmas.db`) is initialized and seeded with demo meetings and reviews.
2. The local server starts on `http://localhost:8000`.
3. Your web browser automatically opens directly to the login screen.

---

## Default Login Credentials

| Role | Username | Password |
| :--- | :--- | :--- |
| **CEO** | `ceo` | `CmasCEO@123` |
| **Assistant** | `assistant` | `CmasAssist@123` |

*Demo data is enabled by default (`CMAS_DEMO_DATA=1`) so you can explore the Daily Register and Previous Meeting Reviews immediately.*

---

## Deploying to Render (Free Cloud Hosting)

This project is pre-configured for instant deployment on [Render](https://render.com/):

### Method 1: Web Service (Dashboard)
1. Push this repository to your GitHub account.
2. On Render, click **New +** → **Web Service** → Connect your GitHub repo.
3. Configure the settings:
   * **Runtime:** `Python 3`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
   * **Instance Type:** `Free`
4. Add Environment Variables:
   * `PYTHON_VERSION`: `3.12.8`
   * `CMAS_SECRET_KEY`: *(Any random string)*
   * `CMAS_DEMO_DATA`: `1`
   * `DATABASE_URL`: `sqlite:///./data/cmas.db`
5. Click **Deploy Web Service** — your app will be live with an HTTPS URL in ~2 minutes!

### Method 2: Render Blueprint (Automatic)
The included `render.yaml` automatically sets up the build command, start command, and environment variables when deployed as a Render Blueprint.

---

## Tech Stack

* **Backend:** FastAPI, SQLAlchemy, Uvicorn, Python 3.12
* **Database:** SQLite (local file-based, zero configuration)
* **Frontend:** React 18, TypeScript, Lucide Icons
* **Security:** JWT Authentication, PBKDF2 Password Hashing
* **Reports:** ReportLab (PDF), Python CSV module
