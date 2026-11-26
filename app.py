from datetime import datetime, timedelta, date
from typing import Optional, List
from pathlib import Path
import os, csv, io, hashlib, hmac, base64, json, webbrowser
from threading import Timer
from fastapi import FastAPI, Depends, HTTPException, status, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Date, Text, ForeignKey, Float
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel, ConfigDict
import uvicorn


SECRET_KEY = os.getenv("CMAS_SECRET_KEY", "CHANGE-THIS-SECRET-IN-PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 480
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/cmas.db")

# Ensure directory for SQLite database exists
if DATABASE_URL.startswith("sqlite"):
    raw_path = DATABASE_URL.split("sqlite:///")[-1]
    db_dir = os.path.dirname(raw_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class PasswordHasher:
    @staticmethod
    def hash(password: str) -> str:
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 250000)
        return base64.urlsafe_b64encode(salt).decode().rstrip("=") + "$" + base64.urlsafe_b64encode(digest).decode().rstrip("=")
    @staticmethod
    def verify(password: str, stored: str) -> bool:
        try:
            salt_part, hash_part = stored.split("$", 1)
            salt = base64.urlsafe_b64decode(salt_part + "=" * (-len(salt_part) % 4))
            expected = base64.urlsafe_b64decode(hash_part + "=" * (-len(hash_part) % 4))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 250000)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

pwd = PasswordHasher()
def b64url(data: bytes) -> str: return base64.urlsafe_b64encode(data).decode().rstrip("=")

def create_token(username: str) -> str:
    header = b64url(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":" )).encode())
    payload = b64url(json.dumps({"sub":username,"exp":int((datetime.utcnow()+timedelta(minutes=ACCESS_TOKEN_MINUTES)).timestamp())},separators=(",",":" )).encode())
    signing = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(SECRET_KEY.encode(),signing,hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"

def decode_token(token: str) -> dict:
    header,payload,signature = token.split(".")
    signing=f"{header}.{payload}".encode()
    expected=b64url(hmac.new(SECRET_KEY.encode(),signing,hashlib.sha256).digest())
    if not hmac.compare_digest(signature,expected): raise ValueError("Bad token signature")
    decoded=json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if decoded.get("exp",0) < int(datetime.utcnow().timestamp()): raise ValueError("Expired token")
    return decoded

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(String(30), nullable=False)
    password_hash = Column(String(255), nullable=False)

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)

class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True)
    meeting_date = Column(Date, nullable=False)
    start_time = Column(String(20), default="")
    end_time = Column(String(20), default="")
    meeting_with = Column(String(250), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    meeting_type = Column(String(80), default="Review")
    location = Column(String(200), default="")
    discussion = Column(Text, default="")
    decisions = Column(Text, default="")
    next_review_date = Column(Date, nullable=True)
    recorded_by = Column(String(120), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    department = relationship("Department")
    tasks = relationship("Task", back_populates="meeting", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True)
    created_date = Column(Date, default=date.today)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    title = Column(String(250), nullable=False)
    discussion = Column(Text, default="")
    action_required = Column(Text, default="")
    assigned_to = Column(String(150), default="")
    accountable = Column(String(150), default="")
    priority = Column(String(20), default="Medium")
    status = Column(String(30), default="Not Started")
    progress = Column(Float, default=0)
    deadline = Column(Date, nullable=True)
    review_date = Column(Date, nullable=True)
    last_update = Column(Text, default="")
    remarks = Column(Text, default="")
    completed_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    department = relationship("Department")
    meeting = relationship("Meeting", back_populates="tasks")
    progress_notes = relationship("ProgressNote", back_populates="task", cascade="all, delete-orphan")

class ProgressNote(Base):
    __tablename__ = "progress_notes"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    update_date = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(120), default="")
    progress = Column(Float, default=0)
    work_completed = Column(Text, default="")
    challenges = Column(Text, default="")
    next_action = Column(Text, default="")
    task = relationship("Task", back_populates="progress_notes")

class DailyEntry(Base):
    __tablename__ = "daily_entries"
    id = Column(Integer, primary_key=True)
    entry_date = Column(Date, nullable=False)
    entry_time = Column(String(20), default="")
    activity_type = Column(String(80), default="Discussion")
    person_met = Column(String(200), default="")
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    discussion = Column(Text, default="")
    decision = Column(Text, default="")
    follow_up_required = Column(String(10), default="No")
    review_date = Column(Date, nullable=True)
    recorded_by = Column(String(120), default="")
    department = relationship("Department")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    actor = Column(String(120), default="")
    record_type = Column(String(40), default="")
    record_id = Column(Integer, nullable=True)
    action = Column(String(40), default="")
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

class SystemConfig(Base):
    __tablename__ = "system_configs"
    key = Column(String(100), primary_key=True)
    value = Column(String(255), default="")

Base.metadata.create_all(engine)

DEFAULT_DEPARTMENTS = ["Operations", "Merchandising", "NPD", "Purchase", "Store & Warehouse", "Quality", "Finance", "HR", "Administration", "Export & Sales", "Production", "General Management"]

def serialize_department(d): return {"id": d.id, "name": d.name} if d else None

def serialize_task(t):
    return {
        "id": t.id,
        "meeting_id": t.meeting_id,
        "created_date": str(t.created_date) if t.created_date else None,
        "department_id": t.department_id,
        "department": serialize_department(t.department) if t.department else None,
        "title": t.title,
        "discussion": t.discussion or "",
        "action_required": t.action_required or "",
        "assigned_to": t.assigned_to or "",
        "accountable": t.accountable or "",
        "priority": t.priority or "Medium",
        "status": t.status or "Not Started",
        "progress": t.progress or 0,
        "deadline": str(t.deadline) if t.deadline else None,
        "review_date": str(t.review_date) if t.review_date else None,
        "last_update": t.last_update or "",
        "remarks": t.remarks or "",
        "completed_date": str(t.completed_date) if t.completed_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None
    }

def serialize_meeting(m):
    return {
        "id": m.id,
        "meeting_date": str(m.meeting_date) if m.meeting_date else None,
        "meeting_date_display": m.meeting_date.strftime("%d %b %Y") if m.meeting_date else "",
        "start_time": m.start_time or "",
        "end_time": m.end_time or "",
        "meeting_with": m.meeting_with,
        "department_id": m.department_id,
        "department": serialize_department(m.department) if m.department else None,
        "meeting_type": m.meeting_type or "Review",
        "location": m.location or "",
        "discussion": m.discussion or "",
        "decisions": m.decisions or "",
        "next_review_date": str(m.next_review_date) if m.next_review_date else None,
        "recorded_by": m.recorded_by or "",
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "tasks": [serialize_task(t) for t in m.tasks] if m.tasks else []
    }

def serialize_daily(e):
    return {
        "id": e.id,
        "entry_date": str(e.entry_date) if e.entry_date else None,
        "entry_time": e.entry_time or "",
        "activity_type": e.activity_type or "Discussion",
        "person_met": e.person_met or "",
        "department_id": e.department_id,
        "department": serialize_department(e.department) if e.department else None,
        "discussion": e.discussion or "",
        "decision": e.decision or "",
        "follow_up_required": e.follow_up_required or "No",
        "review_date": str(e.review_date) if e.review_date else None,
        "recorded_by": e.recorded_by or ""
    }

def seed():
    db = SessionLocal()
    try:
        if not db.query(User).count():
            db.add_all([
                User(username="ceo", full_name="CEO", role="CEO", password_hash=pwd.hash(os.getenv("CMAS_CEO_PASSWORD", "CmasCEO@123"))),
                User(username="assistant", full_name="Management Assistant", role="Assistant", password_hash=pwd.hash(os.getenv("CMAS_ASSISTANT_PASSWORD", "CmasAssist@123")))
            ])
        for name in DEFAULT_DEPARTMENTS:
            if not db.query(Department).filter_by(name=name).first():
                db.add(Department(name=name))
        db.commit()

        # Check if system has ever been initialized before
        seed_marker = db.query(SystemConfig).filter_by(key="initial_seed_done").first()
        if seed_marker:
            # System was already initialized! Never re-seed or overwrite user's deletions.
            return

        # Record persistent marker so demo data is NEVER re-inserted after being deleted
        db.add(SystemConfig(key="initial_seed_done", value="true"))
        db.commit()

        # Seed rich realistic demo data ONLY if explicitly enabled (default is "0" / clean)
        if os.getenv("CMAS_DEMO_DATA", "0").lower() in ("1", "true", "yes") and db.query(Meeting).count() == 0:
            depmap = {d.name: d.id for d in db.query(Department).all()}
            today = date.today()

            # 1. Previous Meeting: Held 4 days ago (Operations) - with Task due for review TODAY (Matches prompt scenario!)
            m_prev_ops = Meeting(
                meeting_date=today - timedelta(days=4),
                start_time="11:00",
                end_time="12:00",
                meeting_with="Operations Strategic Review",
                department_id=depmap.get("Operations"),
                meeting_type="Operational",
                location="CEO Office",
                discussion="Comprehensive review of warehouse layout, storage bottlenecks, workflow congestion and pending stock reconciliation.",
                decisions="Warehouse reorganization plan approved. Phased zone implementation assigned with strict review milestone.",
                next_review_date=today,
                recorded_by="CEO"
            )

            # 2. Today's Meeting: Scheduled/Recorded for Today (Operations Review Team)
            m_today_ops = Meeting(
                meeting_date=today,
                start_time="10:30",
                end_time="11:15",
                meeting_with="Operations Review Team",
                department_id=depmap.get("Operations"),
                meeting_type="Review",
                location="CEO Office",
                discussion="Follow-up on warehouse reorganization progress, daily production scheduling and dispatch staging.",
                decisions="Weekly review to be conducted until closure. Dispatch staging area to be fully cleared by evening.",
                next_review_date=today + timedelta(days=7),
                recorded_by="CEO"
            )

            # 3. Today's Meeting 2: Afternoon review (Production)
            m_today_prod = Meeting(
                meeting_date=today,
                start_time="15:00",
                end_time="15:45",
                meeting_with="Production & Engineering Head",
                department_id=depmap.get("Production"),
                meeting_type="Operational",
                location="Conference Room A",
                discussion="Evaluation of line 2 maintenance schedule, shift output rates, and downtime reduction.",
                decisions="Preventative maintenance scheduled for Saturday morning off-shift.",
                next_review_date=today + timedelta(days=3),
                recorded_by="Assistant"
            )

            # 4. Previous Meeting: Held 2 days ago (Merchandising)
            m_prev_merch = Meeting(
                meeting_date=today - timedelta(days=2),
                start_time="14:00",
                end_time="14:45",
                meeting_with="Merchandising Core Team",
                department_id=depmap.get("Merchandising"),
                meeting_type="Review",
                location="Conference Room B",
                discussion="Review buyer sample readiness, lead times and fabric delivery commitments for new season.",
                decisions="Critical samples to be prioritized. Daily dispatch tracking instituted.",
                next_review_date=today + timedelta(days=5),
                recorded_by="Assistant"
            )

            db.add_all([m_prev_ops, m_today_ops, m_today_prod, m_prev_merch])
            db.commit()

            # Tasks tied to the meetings
            tasks = [
                # TASK 1: Originating from previous meeting (4 days ago) - Due for Review TODAY!
                Task(
                    meeting_id=m_prev_ops.id,
                    department_id=depmap.get("Operations"),
                    title="Implement the proposed warehouse improvement plan",
                    discussion="Warehouse reorganization, 5S workflow layout, and zone-wise segregation.",
                    action_required="Submit zone-wise layout plan with designated owners, racking targets and safety clearance.",
                    assigned_to="Warehouse Manager",
                    accountable="Operations Head",
                    priority="High",
                    status="In Progress",
                    progress=45,
                    deadline=today + timedelta(days=3),
                    review_date=today,  # DUE TODAY
                    last_update="Zone 1 and Zone 2 layout drafted; racking supplier quotation pending."
                ),
                # TASK 2: Also from previous meeting - Review date in 2 days
                Task(
                    meeting_id=m_prev_ops.id,
                    department_id=depmap.get("Store & Warehouse"),
                    title="Pending physical stock reconciliation",
                    discussion="Variances between ERP stock and warehouse physical count.",
                    action_required="Complete physical count in Bay C and report variances to Finance.",
                    assigned_to="Store Team Lead",
                    accountable="Store Manager",
                    priority="Medium",
                    status="Not Started",
                    progress=10,
                    deadline=today + timedelta(days=5),
                    review_date=today + timedelta(days=2)
                ),
                # TASK 3: From today's morning meeting
                Task(
                    meeting_id=m_today_ops.id,
                    department_id=depmap.get("Operations"),
                    title="Clear dispatch staging area and set 5S markers",
                    discussion="Outbound staging area congestion delaying forklift passage.",
                    action_required="Clear old pallet storage, paint aisle yellow lines, and enforce daily end-of-shift audits.",
                    assigned_to="Dispatch Supervisor",
                    accountable="Warehouse Manager",
                    priority="Critical",
                    status="In Progress",
                    progress=25,
                    deadline=today + timedelta(days=1),
                    review_date=today + timedelta(days=1)
                ),
                # TASK 4: Overdue review task (review was yesterday, still in progress)
                Task(
                    meeting_id=m_prev_merch.id,
                    department_id=depmap.get("Merchandising"),
                    title="Priority sample courier tracking and buyer confirmation",
                    discussion="Urgent buyer approval required for autumn delivery batch.",
                    action_required="Send courier AWB numbers to buyer and obtain formal receipt confirmation.",
                    assigned_to="Sampling Coordinator",
                    accountable="Merchandising Head",
                    priority="High",
                    status="In Progress",
                    progress=60,
                    deadline=today,
                    review_date=today - timedelta(days=1),  # OVERDUE REVIEW
                    last_update="Courier dispatched yesterday; waiting for European buyer reception note."
                ),
                # TASK 5: Completed task
                Task(
                    meeting_id=m_prev_merch.id,
                    department_id=depmap.get("Merchandising"),
                    title="Fabric lab dip approvals collation",
                    discussion="Color lab dips for core summer fabric assortment.",
                    action_required="Consolidate lab dip approvals and communicate bulk dye lots.",
                    assigned_to="Fabric Technologist",
                    accountable="Merchandising Head",
                    priority="Medium",
                    status="Completed",
                    progress=100,
                    deadline=today - timedelta(days=1),
                    review_date=today - timedelta(days=1),
                    completed_date=today - timedelta(days=1)
                )
            ]
            db.add_all(tasks)

            # Daily entries
            daily_entries = [
                DailyEntry(
                    entry_date=today,
                    entry_time="09:15",
                    activity_type="Briefing",
                    person_met="General Management Team",
                    department_id=depmap.get("General Management"),
                    discussion="Morning alignment on executive priorities, pending reviews, and today's schedule.",
                    decision="Review warehouse action plan at 10:30 and check line 2 status in afternoon.",
                    follow_up_required="No",
                    recorded_by="CEO"
                ),
                DailyEntry(
                    entry_date=today,
                    entry_time="10:30",
                    activity_type="Meeting",
                    person_met="Operations Review Team",
                    department_id=depmap.get("Operations"),
                    discussion="Operations review regarding warehouse organization and stock reconciliation.",
                    decision="Owners assigned. Daily follow-up through CMAS tracker.",
                    follow_up_required="Yes",
                    review_date=today + timedelta(days=3),
                    recorded_by="CEO"
                ),
                DailyEntry(
                    entry_date=today - timedelta(days=1),
                    entry_time="14:00",
                    activity_type="Review",
                    person_met="Merchandising Team",
                    department_id=depmap.get("Merchandising"),
                    discussion="Sample readiness and buyer feedback review.",
                    decision="Prioritize critical samples for prompt export clearance.",
                    follow_up_required="Yes",
                    review_date=today + timedelta(days=2),
                    recorded_by="Assistant"
                )
            ]
            db.add_all(daily_entries)
            db.commit()
    finally:
        db.close()

seed()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = decode_token(token)
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def log(db, user, record_type, record_id, action, details=""):
    db.add(AuditLog(actor=user.username, record_type=record_type, record_id=record_id, action=action, details=details))

app = FastAPI(title="CMAS — CEO Management Action System", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class MeetingIn(BaseModel):
    meeting_date: date
    start_time: str = ""
    end_time: str = ""
    meeting_with: str
    department_id: Optional[int] = None
    meeting_type: str = "Review"
    location: str = ""
    discussion: str = ""
    decisions: str = ""
    next_review_date: Optional[date] = None
    recorded_by: str = ""

class TaskIn(BaseModel):
    meeting_id: Optional[int] = None
    created_date: Optional[date] = None
    department_id: Optional[int] = None
    title: str
    discussion: str = ""
    action_required: str = ""
    assigned_to: str = ""
    accountable: str = ""
    priority: str = "Medium"
    status: str = "Not Started"
    progress: float = 0
    deadline: Optional[date] = None
    review_date: Optional[date] = None
    last_update: str = ""
    remarks: str = ""

class ProgressIn(BaseModel):
    progress: float
    work_completed: str = ""
    challenges: str = ""
    next_action: str = ""

class QuickReviewIn(BaseModel):
    progress: float
    status: str
    next_review_date: Optional[date] = None
    review_notes: str = ""
    remarks: Optional[str] = None

class DailyIn(BaseModel):
    entry_date: date
    entry_time: str = ""
    activity_type: str = "Discussion"
    person_met: str = ""
    department_id: Optional[int] = None
    discussion: str = ""
    decision: str = ""
    follow_up_required: str = "No"
    review_date: Optional[date] = None
    recorded_by: str = ""

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "CMAS", "version": app.version}

@app.post("/api/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not pwd.verify(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_token(user.username)
    return {"access_token": token, "token_type": "bearer", "user": {"username": user.username, "full_name": user.full_name, "role": user.role}}

@app.get("/api/auth/me")
def me(user: User = Depends(get_user)):
    return {"username": user.username, "full_name": user.full_name, "role": user.role}

@app.get("/api/departments")
def departments(db: Session = Depends(get_db), user: User = Depends(get_user)):
    return [serialize_department(d) for d in db.query(Department).order_by(Department.name).all()]

@app.post("/api/admin/clear-demo-data")
def clear_demo_data(db: Session = Depends(get_db), user: User = Depends(get_user)):
    """Wipes all meetings, tasks, and daily entries so the system starts completely clean."""
    db.query(ProgressNote).delete()
    db.query(Task).delete()
    db.query(Meeting).delete()
    db.query(DailyEntry).delete()
    # Ensure seed marker is saved so it NEVER re-seeds demo data again
    marker = db.query(SystemConfig).filter_by(key="initial_seed_done").first()
    if not marker:
        db.add(SystemConfig(key="initial_seed_done", value="true"))
    log(db, user, "system", 0, "purge", "Cleared all demo and testing data")
    db.commit()
    return {"ok": True, "message": "All testing data successfully cleared. Fresh empty database ready."}

# =========================================================================
# 1. DAILY CEO REGISTER (Date-Based Meeting Management)
# =========================================================================
@app.get("/api/daily-register")
def get_daily_register(date_str: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(get_user)):
    """
    Returns meetings and daily activity primarily for the requested date (defaults to today).
    Ensures present-day meetings are clean, focused, and distinct from historical records.
    """
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else date.today()
    except Exception:
        target_date = date.today()

    meetings = db.query(Meeting).filter(Meeting.meeting_date == target_date).order_by(Meeting.start_time.asc(), Meeting.id.desc()).all()
    daily_entries = db.query(DailyEntry).filter(DailyEntry.entry_date == target_date).order_by(DailyEntry.entry_time.asc(), DailyEntry.id.desc()).all()
    
    total_tasks_today = sum(len(m.tasks) for m in meetings)

    return {
        "date": str(target_date),
        "date_display": target_date.strftime("%A, %d %B %Y"),
        "is_today": (target_date == date.today()),
        "total_meetings": len(meetings),
        "total_tasks_today": total_tasks_today,
        "meetings": [serialize_meeting(m) for m in meetings],
        "daily_entries": [serialize_daily(d) for d in daily_entries]
    }

# =========================================================================
# 2. PREVIOUS MEETING REVIEW
# =========================================================================
@app.get("/api/reviews")
def get_previous_meeting_reviews(
    filter_type: str = "due_today", # "due_today", "overdue", "upcoming", "all", "completed"
    date_str: Optional[str] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_user)
):
    """
    Retrieves previous meeting records based on their assigned task review dates.
    Helps the CEO identify tasks originating from earlier meetings that are due for follow-up today.
    """
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else date.today()
    except Exception:
        target_date = date.today()

    query = db.query(Task).join(Meeting, Task.meeting_id == Meeting.id, isouter=True)

    if department_id:
        query = query.filter((Task.department_id == department_id) | (Meeting.department_id == department_id))

    if filter_type == "due_today":
        # Specific review date equals target date and task is not completed
        query = query.filter(Task.review_date == target_date, Task.status != "Completed")
    elif filter_type == "overdue":
        # Review date has passed and task is still not completed
        query = query.filter(Task.review_date < target_date, Task.status != "Completed")
    elif filter_type == "upcoming":
        # Review date is in the future
        query = query.filter(Task.review_date > target_date, Task.status != "Completed")
    elif filter_type == "completed":
        query = query.filter(Task.status == "Completed")
    elif filter_type == "all":
        # All tasks with a review date
        query = query.filter(Task.review_date.isnot(None))

    tasks = query.order_by(Task.review_date.asc(), Task.priority.desc()).all()

    reviews = []
    for t in tasks:
        m = t.meeting
        dep = t.department or (m.department if m else None)
        is_due_today = (t.review_date == target_date)
        is_overdue = bool(t.review_date and t.review_date < target_date and t.status != "Completed")
        days_overdue = (target_date - t.review_date).days if is_overdue else 0
        days_since_meeting = (target_date - m.meeting_date).days if (m and m.meeting_date) else None

        if is_due_today:
            review_reason = f"Scheduled follow-up due today ({target_date.strftime('%d %b %Y')}) for task assigned in meeting on {m.meeting_date.strftime('%d %b %Y') if m else 'earlier session'}."
        elif is_overdue:
            review_reason = f"Overdue review! Scheduled review date was {t.review_date.strftime('%d %b %Y')} ({days_overdue} days ago) but status is still {t.status}."
        elif t.status == "Completed":
            review_reason = f"Completed action item (completed on {t.completed_date or 'record'})."
        else:
            review_reason = f"Upcoming review scheduled for {t.review_date.strftime('%d %b %Y')}."

        reviews.append({
            "id": t.id,
            "task_id": t.id,
            "title": t.title,
            "action_required": t.action_required or t.discussion or "No specific action description.",
            "assigned_to": t.assigned_to or "Unassigned",
            "accountable": t.accountable or "Unassigned",
            "priority": t.priority or "Medium",
            "status": t.status or "Not Started",
            "progress": t.progress or 0,
            "deadline": str(t.deadline) if t.deadline else None,
            "review_date": str(t.review_date) if t.review_date else None,
            "last_update": t.last_update or "",
            "remarks": t.remarks or "",
            "completed_date": str(t.completed_date) if t.completed_date else None,
            # Originating meeting information
            "meeting_id": m.id if m else None,
            "meeting_date": str(m.meeting_date) if (m and m.meeting_date) else None,
            "meeting_date_display": m.meeting_date.strftime("%d %b %Y") if (m and m.meeting_date) else "Direct Assignment",
            "meeting_with": m.meeting_with if m else "Direct CEO Assignment",
            "meeting_type": m.meeting_type if m else "Review",
            "meeting_location": m.location if m else "",
            "meeting_discussion": m.discussion if m else "",
            "meeting_decisions": m.decisions if m else "",
            # Department
            "department_id": dep.id if dep else None,
            "department_name": dep.name if dep else "General Management",
            # Review indicators
            "is_due_today": is_due_today,
            "is_overdue": is_overdue,
            "days_overdue": days_overdue,
            "days_since_meeting": days_since_meeting,
            "review_reason": review_reason
        })

    return reviews

@app.post("/api/tasks/{tid}/quick-review")
def quick_review_task(tid: int, data: QuickReviewIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    """
    Direct follow-up & review action on a task from the Previous Meeting Review section.
    """
    t = db.query(Task).filter_by(id=tid).first()
    if not t:
        raise HTTPException(404, "Task not found")

    old_status = t.status
    old_progress = t.progress
    t.progress = data.progress
    t.status = data.status

    if data.status == "Completed":
        t.completed_date = date.today()
    elif old_status == "Completed" and data.status != "Completed":
        t.completed_date = None

    if data.next_review_date:
        t.review_date = data.next_review_date

    if data.review_notes:
        t.last_update = data.review_notes
        db.add(ProgressNote(
            task_id=tid,
            updated_by=user.username,
            progress=data.progress,
            work_completed=data.review_notes,
            challenges=data.remarks or "",
            next_action=f"Next review: {data.next_review_date}" if data.next_review_date else ""
        ))

    if data.remarks:
        t.remarks = data.remarks

    log(db, user, "task", tid, "review", f"Reviewed task '{t.title}': progress {old_progress}% -> {data.progress}%, status {old_status} -> {data.status}")
    db.commit()
    db.refresh(t)
    return serialize_task(t)

# =========================================================================
# 3. MEETINGS (ALL & HISTORICAL MEETINGS)
# =========================================================================
@app.get("/api/meetings")
def meetings(
    filter_type: str = "all", # "all", "today", "past", "upcoming"
    date_str: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_user)
):
    today = date.today()
    query = db.query(Meeting)

    if date_str:
        try:
            target = datetime.strptime(date_str, "%Y-%m-%d").date()
            query = query.filter(Meeting.meeting_date == target)
        except Exception:
            pass
    elif filter_type == "today":
        query = query.filter(Meeting.meeting_date == today)
    elif filter_type == "past":
        query = query.filter(Meeting.meeting_date < today)
    elif filter_type == "upcoming":
        query = query.filter(Meeting.meeting_date > today)

    return [serialize_meeting(m) for m in query.order_by(Meeting.meeting_date.desc(), Meeting.id.desc()).all()]

@app.post("/api/meetings")
def create_meeting(data: MeetingIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    m = Meeting(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    log(db, user, "meeting", m.id, "create", f"Recorded meeting with {m.meeting_with} on {m.meeting_date}")
    db.commit()
    return serialize_meeting(m)

@app.put("/api/meetings/{mid}")
def update_meeting(mid: int, data: MeetingIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    m = db.query(Meeting).filter_by(id=mid).first()
    if not m:
        raise HTTPException(404, "Meeting not found")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    log(db, user, "meeting", mid, "update", f"Updated meeting details with {m.meeting_with} ({m.meeting_date})")
    db.commit()
    db.refresh(m)
    return serialize_meeting(m)

@app.delete("/api/meetings/{mid}")
def delete_meeting(mid: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    m = db.query(Meeting).filter_by(id=mid).first()
    if not m:
        raise HTTPException(404, "Meeting not found")
    log(db, user, "meeting", mid, "delete", f"Deleted meeting record with {m.meeting_with} held on {m.meeting_date}")
    db.delete(m)
    db.commit()
    return {"ok": True, "deleted_id": mid}

# =========================================================================
# 4. TASKS & CENTRAL ACTION TRACKER
# =========================================================================
@app.get("/api/tasks")
def tasks(db: Session = Depends(get_db), user: User = Depends(get_user)):
    return [serialize_task(t) for t in db.query(Task).order_by(Task.deadline.asc().nullslast(), Task.id.desc()).all()]

@app.post("/api/tasks")
def create_task(data: TaskIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    t = Task(**data.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    log(db, user, "task", t.id, "create", f"Assigned task '{t.title}' to {t.assigned_to}")
    db.commit()
    return serialize_task(t)

@app.put("/api/tasks/{tid}")
def update_task(tid: int, data: TaskIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    t = db.query(Task).filter_by(id=tid).first()
    if not t:
        raise HTTPException(404, "Task not found")
    old_status = t.status
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    if t.status == "Completed" and not t.completed_date:
        t.completed_date = date.today()
    if t.status != "Completed":
        t.completed_date = None
    log(db, user, "task", tid, "update", f"status: {old_status} -> {t.status}")
    db.commit()
    db.refresh(t)
    return serialize_task(t)

@app.delete("/api/tasks/{tid}")
def delete_task(tid: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    t = db.query(Task).filter_by(id=tid).first()
    if not t:
        raise HTTPException(404, "Task not found")
    db.delete(t)
    log(db, user, "task", tid, "delete", f"Deleted task '{t.title}'")
    db.commit()
    return {"ok": True}

@app.post("/api/tasks/{tid}/progress")
def add_progress(tid: int, data: ProgressIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    t = db.query(Task).filter_by(id=tid).first()
    if not t:
        raise HTTPException(404, "Task not found")
    t.progress = data.progress
    t.last_update = data.work_completed
    db.add(ProgressNote(
        task_id=tid,
        updated_by=user.username,
        progress=data.progress,
        work_completed=data.work_completed,
        challenges=data.challenges,
        next_action=data.next_action
    ))
    log(db, user, "task", tid, "progress", f"Progress update: {data.progress}%")
    db.commit()
    return {"ok": True}

@app.get("/api/tasks/{tid}/progress")
def progress_history(tid: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    return db.query(ProgressNote).filter_by(task_id=tid).order_by(ProgressNote.update_date.desc()).all()

# =========================================================================
# 5. DAILY ENTRIES (CEO EXECUTIVE JOURNAL)
# =========================================================================
@app.get("/api/daily")
def daily(db: Session = Depends(get_db), user: User = Depends(get_user)):
    return [serialize_daily(e) for e in db.query(DailyEntry).order_by(DailyEntry.entry_date.desc(), DailyEntry.id.desc()).all()]

@app.post("/api/daily")
def create_daily(data: DailyIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    e = DailyEntry(**data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    log(db, user, "daily", e.id, "create", f"Recorded daily entry with {e.person_met}")
    db.commit()
    return serialize_daily(e)

@app.put("/api/daily/{eid}")
def update_daily(eid: int, data: DailyIn, db: Session = Depends(get_db), user: User = Depends(get_user)):
    e = db.query(DailyEntry).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    for k, v in data.model_dump().items():
        setattr(e, k, v)
    log(db, user, "daily", eid, "update")
    db.commit()
    return serialize_daily(e)

@app.delete("/api/daily/{eid}")
def delete_daily(eid: int, db: Session = Depends(get_db), user: User = Depends(get_user)):
    e = db.query(DailyEntry).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Entry not found")
    db.delete(e)
    log(db, user, "daily", eid, "delete")
    db.commit()
    return {"ok": True}

# =========================================================================
# 6. DASHBOARD & OVERVIEW
# =========================================================================
@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_user)):
    today = date.today()
    ts = db.query(Task).all()
    ms = db.query(Meeting).all()

    overdue = [t for t in ts if t.deadline and t.deadline < today and t.status not in ("Completed", "On Hold")]
    due_today = [t for t in ts if t.deadline == today and t.status != "Completed"]

    today_meetings = [m for m in ms if m.meeting_date == today]
    upcoming_meetings = [m for m in ms if m.meeting_date > today]
    past_meetings = [m for m in ms if m.meeting_date < today]

    reviews_due_today = [t for t in ts if t.review_date == today and t.status != "Completed"]
    reviews_overdue = [t for t in ts if t.review_date and t.review_date < today and t.status != "Completed"]
    reviews_upcoming = [t for t in ts if t.review_date and t.review_date > today and t.status != "Completed"]

    return {
        "today_date": str(today),
        "today_date_display": today.strftime("%A, %d %B %Y"),
        "total_tasks": len(ts),
        "completed": sum(t.status == "Completed" for t in ts),
        "in_progress": sum(t.status == "In Progress" for t in ts),
        "overdue": len(overdue),
        "due_today": len(due_today),
        "meetings_total": len(ms),
        "today_meetings_count": len(today_meetings),
        "upcoming_meetings_count": len(upcoming_meetings),
        "past_meetings_count": len(past_meetings),
        "reviews_due_today_count": len(reviews_due_today),
        "reviews_overdue_count": len(reviews_overdue),
        "reviews_upcoming_count": len(reviews_upcoming),
        "today_meetings": [serialize_meeting(m) for m in today_meetings],
        "reviews_due_today": [serialize_task(t) for t in reviews_due_today[:6]],
        "recent_tasks": [serialize_task(t) for t in ts[:8]],
        "recent_meetings": [serialize_meeting(m) for m in ms[:8]],
        "overdue_tasks": [serialize_task(t) for t in overdue[:8]]
    }

# =========================================================================
# 7. REPORTS & EXPORTS
# =========================================================================
@app.get("/api/reports/tasks.csv")
def export_tasks(db: Session = Depends(get_db), user: User = Depends(get_user)):
    output = io.StringIO(); w = csv.writer(output)
    w.writerow(["Task ID", "Meeting ID", "Date Assigned", "Department", "Task", "Discussion", "Action Required", "Assigned To", "Accountable", "Priority", "Status", "Progress %", "Deadline", "Review Date", "Last Update", "Remarks"])
    for t in db.query(Task).all():
        w.writerow([t.id, t.meeting_id, t.created_date, t.department.name if t.department else "", t.title, t.discussion, t.action_required, t.assigned_to, t.accountable, t.priority, t.status, t.progress, t.deadline, t.review_date, t.last_update, t.remarks])
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=cmas_action_tracker.csv"})

@app.get("/api/reports/tasks.pdf")
def export_pdf(db: Session = Depends(get_db), user: User = Depends(get_user)):
    from reportlab.lib.pagesizes import landscape, A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=24, bottomMargin=24)
    styles = getSampleStyleSheet()
    story = [Paragraph("CMAS — Central Management Action Tracker", styles["Title"]), Paragraph(f"Generated: {datetime.now().strftime('%d %b %Y, %H:%M')}", styles["Normal"]), Spacer(1, 12)]
    data = [["ID", "Department", "Task", "Owner", "Priority", "Status", "Progress", "Deadline", "Review"]]
    for t in db.query(Task).order_by(Task.deadline).all():
        data.append([str(t.id), t.department.name if t.department else "—", t.title, t.assigned_to, t.priority, t.status, f"{t.progress:.0f}%", str(t.deadline or "—"), str(t.review_date or "—")])
    table = Table(data, repeatRows=1, colWidths=[35, 85, 210, 90, 55, 70, 45, 65, 65])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#14243a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d5dce5")),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")])
    ]))
    story.append(table)
    doc.build(story)
    buffer.seek(0)
    return Response(buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=cmas_action_tracker.pdf"})

@app.get("/api/reports/reviews.csv")
def export_reviews_csv(db: Session = Depends(get_db), user: User = Depends(get_user)):
    output = io.StringIO(); w = csv.writer(output)
    w.writerow(["Task ID", "Task Title", "Action Required", "Assigned To", "Accountable", "Priority", "Status", "Progress %", "Deadline", "Review Date", "Original Meeting Date", "Meeting With", "Department"])
    tasks = db.query(Task).join(Meeting, Task.meeting_id == Meeting.id, isouter=True).filter(Task.review_date.isnot(None)).order_by(Task.review_date.asc()).all()
    for t in tasks:
        m = t.meeting
        dep = t.department or (m.department if m else None)
        w.writerow([
            t.id, t.title, t.action_required, t.assigned_to, t.accountable, t.priority, t.status, f"{t.progress}%",
            t.deadline or "", t.review_date or "", m.meeting_date if m else "", m.meeting_with if m else "", dep.name if dep else ""
        ])
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=cmas_previous_meeting_reviews_{date.today()}.csv"})

@app.get("/api/audit")
def audit(db: Session = Depends(get_db), user: User = Depends(get_user)):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(300).all()

# =========================================================================
# 8. SERVE UNIFIED FRONTEND
# =========================================================================
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path("/app/frontend/dist")

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    is_cloud = os.getenv("RENDER") is not None or os.getenv("PORT") is not None
    host = "0.0.0.0" if is_cloud else "127.0.0.1"

    print("\n" + "=" * 60)
    print("  CMAS — CEO Management Action System")
    print(f"  Server is starting at: http://{host}:{port}")
    print("  ")
    print("  Default Login:")
    print("    CEO:       ceo       / CmasCEO@123")
    print("    Assistant: assistant / CmasAssist@123")
    print("  ")
    print("  Database: SQLite (data/cmas.db)")
    print("  Press Ctrl + C in this terminal to stop.")
    print("=" * 60 + "\n")

    if not is_cloud:
        Timer(1.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    uvicorn.run(app, host=host, port=port)
