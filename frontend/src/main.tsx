import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, ClipboardList,
  FileSpreadsheet, LayoutDashboard, LogOut, Menu, NotebookPen, Plus, Search,
  Settings, Users, X, Bell, ArrowUpRight, Clock3, Building2, Trash2, Edit3,
  RotateCcw, Calendar, Check, AlertTriangle, ArrowRight, Eye, ChevronLeft, ChevronRight
} from 'lucide-react';
import './styles.css';

const API = '/api';

type Department = { id: number; name: string };

type Task = {
  id: number;
  meeting_id: number | null;
  department_id: number | null;
  department?: Department;
  title: string;
  discussion: string;
  action_required: string;
  assigned_to: string;
  accountable: string;
  priority: string;
  status: string;
  progress: number;
  deadline: string | null;
  review_date: string | null;
  created_date: string;
  last_update: string;
  remarks: string;
};

type Meeting = {
  id: number;
  tasks?: Task[];
  meeting_date: string;
  meeting_date_display?: string;
  start_time: string;
  end_time: string;
  meeting_with: string;
  department_id: number | null;
  department?: Department;
  meeting_type: string;
  location: string;
  discussion: string;
  decisions: string;
  next_review_date: string | null;
  recorded_by: string;
};

type ReviewItem = {
  id: number;
  task_id: number;
  title: string;
  action_required: string;
  assigned_to: string;
  accountable: string;
  priority: string;
  status: string;
  progress: number;
  deadline: string | null;
  review_date: string | null;
  last_update: string;
  remarks: string;
  completed_date: string | null;
  meeting_id: number | null;
  meeting_date: string | null;
  meeting_date_display: string;
  meeting_with: string;
  meeting_type: string;
  meeting_location: string;
  meeting_discussion: string;
  meeting_decisions: string;
  department_id: number | null;
  department_name: string;
  is_due_today: boolean;
  is_overdue: boolean;
  days_overdue: number;
  days_since_meeting: number | null;
  review_reason: string;
};

type DailyEntry = {
  id: number;
  entry_date: string;
  entry_time: string;
  activity_type: string;
  person_met: string;
  department_id: number | null;
  department?: Department;
  discussion: string;
  decision: string;
  follow_up_required: string;
  review_date: string | null;
  recorded_by: string;
};

const statusClass = (s: string) => (s || '').toLowerCase().replaceAll(' ', '-');
const formatTodayStr = () => new Date().toISOString().slice(0, 10);

function App() {
  const [token, setToken] = useState<string>(localStorage.getItem('cmas_token') || '');
  const [user, setUser] = useState<any>(null);
  const [login, setLogin] = useState({ username: 'ceo', password: '' });
  const [page, setPage] = useState<string>('dashboard');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dashboard, setDashboard] = useState<any>({});
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  // Daily CEO Register state
  const [dailyDate, setDailyDate] = useState<string>(formatTodayStr());
  const [dailyRegister, setDailyRegister] = useState<any>({ meetings: [], daily_entries: [], total_meetings: 0, total_tasks_today: 0, is_today: true });

  // Filter states
  const [reviewFilter, setReviewFilter] = useState<string>('due_today');
  const [meetingFilter, setMeetingFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('All Departments');
  const [filterStatus, setFilterStatus] = useState<string>('All Status');

  // Modals & form state
  const [modal, setModal] = useState<string>('');
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: number; name: string } | null>(null);
  const [activeReview, setActiveReview] = useState<ReviewItem | null>(null);

  const [taskForm, setTaskForm] = useState<any>({
    title: '', meeting_id: '', department_id: '', discussion: '', action_required: '',
    assigned_to: '', accountable: '', priority: 'Medium', status: 'Not Started',
    progress: 0, deadline: '', review_date: '', remarks: ''
  });

  const [meetingForm, setMeetingForm] = useState<any>({
    meeting_date: formatTodayStr(), start_time: '', end_time: '', meeting_with: '',
    department_id: '', meeting_type: 'Review', location: '', discussion: '',
    decisions: '', next_review_date: '', recorded_by: ''
  });

  const [dailyForm, setDailyForm] = useState<any>({
    entry_date: formatTodayStr(), entry_time: '', activity_type: 'Discussion',
    person_met: '', department_id: '', discussion: '', decision: '',
    follow_up_required: 'No', review_date: '', recorded_by: ''
  });

  const [reviewForm, setReviewForm] = useState<any>({
    progress: 0, status: 'In Progress', next_review_date: '', review_notes: '', remarks: ''
  });

  const [error, setError] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Authenticated HTTP request helper
  const req = async (path: string, opts: any = {}) => {
    const r = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!r.ok) {
      const msg = await r.text();
      throw new Error(msg || `Request failed ${r.status}`);
    }
    return r.status === 204 ? null : r.json();
  };

  const refresh = async () => {
    if (!token) return;
    try {
      const [t, m, d, dep, dash, dr, rev] = await Promise.all([
        req('/tasks'),
        req(`/meetings?filter_type=${meetingFilter}`),
        req('/daily'),
        req('/departments'),
        req('/dashboard'),
        req(`/daily-register?date_str=${dailyDate}`),
        req(`/reviews?filter_type=${reviewFilter}`)
      ]);
      setTasks(t);
      setMeetings(m);
      setDaily(d);
      setDepartments(dep);
      setDashboard(dash);
      setDailyRegister(dr);
      setReviews(rev);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (token) {
      localStorage.setItem('cmas_token', token);
      req('/auth/me')
        .then(setUser)
        .catch(() => {
          setToken('');
          localStorage.removeItem('cmas_token');
        });
    }
  }, [token]);

  useEffect(() => {
    if (user) refresh();
  }, [user, dailyDate, reviewFilter, meetingFilter]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const form = new URLSearchParams();
      form.set('username', login.username);
      form.set('password', login.password);
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
      });
      if (!r.ok) throw new Error('Invalid username or password');
      const data = await r.json();
      setToken(data.access_token);
      setUser(data.user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('cmas_token');
  };

  // Date shifting for Daily CEO Register
  const shiftDailyDate = (days: number) => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() + days);
    setDailyDate(d.toISOString().slice(0, 10));
  };

  const jumpToToday = () => {
    setDailyDate(formatTodayStr());
  };

  // Handlers for Save / Edit / Delete
  const saveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...meetingForm,
        department_id: meetingForm.department_id ? Number(meetingForm.department_id) : null,
        next_review_date: meetingForm.next_review_date || null
      };
      await req(editId ? `/meetings/${editId}` : '/meetings', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setModal('');
      setEditId(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openEditMeeting = (m: Meeting) => {
    setEditId(m.id);
    setMeetingForm({
      meeting_date: m.meeting_date,
      start_time: m.start_time || '',
      end_time: m.end_time || '',
      meeting_with: m.meeting_with || '',
      department_id: m.department_id || '',
      meeting_type: m.meeting_type || 'Review',
      location: m.location || '',
      discussion: m.discussion || '',
      decisions: m.decisions || '',
      next_review_date: m.next_review_date || '',
      recorded_by: m.recorded_by || user?.full_name || ''
    });
    setModal('meeting');
  };

  const openNewMeetingForDate = (dateVal?: string) => {
    setEditId(null);
    setMeetingForm({
      meeting_date: dateVal || dailyDate || formatTodayStr(),
      start_time: '',
      end_time: '',
      meeting_with: '',
      department_id: '',
      meeting_type: 'Review',
      location: '',
      discussion: '',
      decisions: '',
      next_review_date: '',
      recorded_by: user?.full_name || ''
    });
    setModal('meeting');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'meeting') {
        await req(`/meetings/${deleteTarget.id}`, { method: 'DELETE' });
      } else if (deleteTarget.type === 'task') {
        await req(`/tasks/${deleteTarget.id}`, { method: 'DELETE' });
      } else if (deleteTarget.type === 'daily') {
        await req(`/daily/${deleteTarget.id}`, { method: 'DELETE' });
      }
      setDeleteTarget(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveQuickReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReview) return;
    try {
      const payload = {
        progress: Number(reviewForm.progress),
        status: reviewForm.status,
        next_review_date: reviewForm.next_review_date || null,
        review_notes: reviewForm.review_notes || '',
        remarks: reviewForm.remarks || ''
      };
      await req(`/tasks/${activeReview.task_id}/quick-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setModal('');
      setActiveReview(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openQuickReviewModal = (item: ReviewItem) => {
    setActiveReview(item);
    setReviewForm({
      progress: item.progress || 0,
      status: item.status || 'In Progress',
      next_review_date: '',
      review_notes: '',
      remarks: item.remarks || ''
    });
    setModal('quick_review');
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...taskForm,
        meeting_id: taskForm.meeting_id ? Number(taskForm.meeting_id) : null,
        department_id: taskForm.department_id ? Number(taskForm.department_id) : null,
        progress: Number(taskForm.progress),
        deadline: taskForm.deadline || null,
        review_date: taskForm.review_date || null
      };
      await req(editId ? `/tasks/${editId}` : '/tasks', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setModal('');
      setEditId(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openNewTask = (meetingId?: number, deptId?: number) => {
    setEditId(null);
    setTaskForm({
      title: '',
      meeting_id: meetingId || '',
      department_id: deptId || '',
      discussion: '',
      action_required: '',
      assigned_to: '',
      accountable: '',
      priority: 'Medium',
      status: 'Not Started',
      progress: 0,
      deadline: '',
      review_date: formatTodayStr(),
      remarks: ''
    });
    setModal('task');
  };

  const editTask = (t: Task) => {
    setEditId(t.id);
    setTaskForm({
      ...t,
      meeting_id: t.meeting_id || '',
      department_id: t.department_id || '',
      deadline: t.deadline || '',
      review_date: t.review_date || ''
    });
    setModal('task');
  };

  const saveDaily = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...dailyForm,
        department_id: dailyForm.department_id ? Number(dailyForm.department_id) : null,
        review_date: dailyForm.review_date || null
      };
      await req(editId ? `/daily/${editId}` : '/daily', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setModal('');
      setEditId(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openNewDaily = () => {
    setEditId(null);
    setDailyForm({
      entry_date: dailyDate || formatTodayStr(),
      entry_time: '',
      activity_type: 'Discussion',
      person_met: '',
      department_id: '',
      discussion: '',
      decision: '',
      follow_up_required: 'No',
      review_date: '',
      recorded_by: user?.full_name || ''
    });
    setModal('daily');
  };

  const editDaily = (d: DailyEntry) => {
    setEditId(d.id);
    setDailyForm({
      ...d,
      department_id: d.department_id || '',
      review_date: d.review_date || ''
    });
    setModal('daily');
  };

  const download = (kind: string, type: string = 'tasks') => {
    fetch(`${API}/reports/${type}.${kind}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Export failed');
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cmas_${type}_tracker.${kind}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setError(e.message));
  };

  // Filtered views
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = query.toLowerCase();
      const matches = [t.title, t.assigned_to, t.department?.name, t.action_required].join(' ').toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'All Status' || t.status === filterStatus;
      const matchesDept = filterDept === 'All Departments' || t.department?.name === filterDept;
      return matches && matchesStatus && matchesDept;
    });
  }, [tasks, query, filterStatus, filterDept]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const q = query.toLowerCase();
      const matches = [r.title, r.assigned_to, r.department_name, r.action_required, r.meeting_with, r.meeting_discussion].join(' ').toLowerCase().includes(q);
      const matchesDept = filterDept === 'All Departments' || r.department_name === filterDept;
      return matches && matchesDept;
    });
  }, [reviews, query, filterDept]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const q = query.toLowerCase();
      const matches = [m.meeting_with, m.department?.name, m.discussion, m.decisions, m.meeting_type].join(' ').toLowerCase().includes(q);
      const matchesDept = filterDept === 'All Departments' || m.department?.name === filterDept;
      return matches && matchesDept;
    });
  }, [meetings, query, filterDept]);

  if (!token || !user) {
    return (
      <div className="login-shell">
        <div className="login-art">
          <div className="login-brand">
            <div className="brand-mark">CM</div>
            <span>CMAS</span>
          </div>
          <div className="login-message">
            <p className="eyebrow">EXECUTIVE OPERATIONS</p>
            <h1>Decisions should move.<br />Actions should matter.</h1>
            <p>Unified executive system for daily meetings, automated follow-up reviews, and action tracking.</p>
            <div className="login-stat">
              <span><b>Daily Register</b><small>Today's meetings only</small></span>
              <span><b>Previous Reviews</b><small>Automated follow-up</small></span>
              <span><b>Accountability</b><small>Direct responsibility</small></span>
            </div>
          </div>
        </div>
        <form className="login-card" onSubmit={signIn}>
          <div className="brand-mark small">CM</div>
          <h2>Welcome back</h2>
          <p>Sign in to the Daily CEO Management System</p>
          <label>
            Username
            <input
              value={login.username}
              onChange={(e) => setLogin({ ...login, username: e.target.value })}
              placeholder="Username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary full">Sign in <ArrowUpRight size={16} /></button>
          <div className="login-hint">Demo Login: ceo / CmasCEO@123</div>
        </form>
      </div>
    );
  }

  const nav = [
    { key: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { key: 'daily', name: 'Daily CEO Register', icon: NotebookPen, badge: dashboard?.today_meetings_count },
    { key: 'reviews', name: 'Previous Meeting Review', icon: Clock3, badge: dashboard?.reviews_due_today_count, alert: dashboard?.reviews_overdue_count > 0 },
    { key: 'meetings', name: 'Meetings (All & Done)', icon: CalendarDays },
    { key: 'tasks', name: 'Action Tracker', icon: ClipboardList },
    { key: 'departments', name: 'Departments', icon: Building2 },
    { key: 'reports', name: 'Reports & Exports', icon: FileSpreadsheet }
  ];

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">CM</div>
          <div>
            <b>CMAS</b>
            <small>Daily CEO System</small>
          </div>
          <button className="icon-btn mobile-close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => {
                setPage(n.key);
                setSidebarOpen(false);
              }}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.badge !== undefined && n.badge > 0 && (
                <span className={`nav-badge ${n.alert ? 'alert' : ''}`}>{n.badge}</span>
              )}
              {page === n.key && !n.badge && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-light" />
            Executive System Online
            <small>SQLite Database Active</small>
          </div>
          <div className="user-profile">
            <div className="avatar">{user.full_name?.slice(0, 1) || 'U'}</div>
            <div className="user-meta">
              <b>{user.full_name}</b>
              <small>{user.role}</small>
            </div>
            <button className="icon-btn" onClick={logout} title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <b>/</b>
            <strong>{nav.find((n) => n.key === page)?.name || page}</strong>
          </div>
          <div className="top-actions">
            <span className="today-label">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {dashboard?.reviews_due_today_count > 0 && (
              <button
                className="secondary btn-sm"
                onClick={() => {
                  setPage('reviews');
                  setReviewFilter('due_today');
                }}
              >
                <Clock3 size={14} color="#e0a54f" />
                <span>{dashboard.reviews_due_today_count} Reviews Due Today</span>
              </button>
            )}
            <div className="avatar top-avatar">{user.full_name?.slice(0, 1) || 'U'}</div>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')}><X size={16} /></button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 1: DASHBOARD */}
          {/* ========================================================================= */}
          {page === 'dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">EXECUTIVE OVERVIEW</p>
                  <h1>Good day, {user.full_name}.</h1>
                  <p className="subheading">Here is your daily executive summary and review schedule.</p>
                </div>
                <div className="page-heading-actions">
                  <button className="primary" onClick={() => openNewMeetingForDate(formatTodayStr())}>
                    <Plus size={16} /> Record Today's Meeting
                  </button>
                </div>
              </div>

              {/* Key Executive Metrics */}
              <div className="metric-grid">
                <Metric
                  label="Today's Meetings"
                  value={dashboard?.today_meetings_count || 0}
                  icon={<CalendarDays />}
                  accent="blue"
                  note="Scheduled / held today"
                />
                <Metric
                  label="Reviews Due Today"
                  value={dashboard?.reviews_due_today_count || 0}
                  icon={<Clock3 />}
                  accent="amber"
                  note="Assigned in earlier meetings"
                />
                <Metric
                  label="Overdue Reviews"
                  value={dashboard?.reviews_overdue_count || 0}
                  icon={<CircleAlert />}
                  accent="red"
                  note="Past review date"
                />
                <Metric
                  label="Completed Actions"
                  value={dashboard?.completed || 0}
                  icon={<CheckCircle2 />}
                  accent="green"
                  note={`${dashboard?.total_tasks ? Math.round((dashboard.completed / dashboard.total_tasks) * 100) : 0}% completion`}
                />
              </div>

              {/* Quick Actions & Reviews Callout */}
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2><Clock3 size={18} color="#bd8834" /> Today's Scheduled Reviews</h2>
                      <p>Tasks from previous meetings that require CEO follow-up today</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setPage('reviews');
                        setReviewFilter('due_today');
                      }}
                    >
                      Open Review Section <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {dashboard?.reviews_due_today && dashboard.reviews_due_today.length > 0 ? (
                    <div className="meeting-card-list">
                      {dashboard.reviews_due_today.map((t: Task) => (
                        <div key={t.id} className="meeting-task-item">
                          <div>
                            <b>{t.title}</b>
                            <small className="cell-sub">
                              Assigned to: {t.assigned_to || 'Unassigned'} · Dept: {t.department?.name || 'General'}
                            </small>
                          </div>
                          <span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: '#718096', padding: '10px 0' }}>
                      No reviews currently due today. All past meetings are up to date.
                    </p>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Quick Executive Actions</h2>
                      <p>Record, review, or assign responsibilities</p>
                    </div>
                  </div>
                  <div className="quick-actions">
                    <button onClick={() => { setPage('daily'); jumpToToday(); }}>
                      <div className="quick-icon blue-bg"><NotebookPen /></div>
                      <span>
                        <b>Daily CEO Register</b>
                        <small>Manage today's meetings only</small>
                      </span>
                      <ArrowUpRight />
                    </button>
                    <button onClick={() => { setPage('reviews'); setReviewFilter('due_today'); }}>
                      <div className="quick-icon purple-bg"><Clock3 /></div>
                      <span>
                        <b>Previous Meeting Review</b>
                        <small>Automatic follow-ups for today</small>
                      </span>
                      <ArrowUpRight />
                    </button>
                    <button onClick={() => openNewTask()}>
                      <div className="quick-icon green-bg"><ClipboardList /></div>
                      <span>
                        <b>Assign New Task</b>
                        <small>Set owner, deadline & review date</small>
                      </span>
                      <ArrowUpRight />
                    </button>
                  </div>
                </section>
              </div>

              {/* Today's Meetings Overview */}
              <section className="panel table-panel">
                <div className="panel-head">
                  <div>
                    <h2><CalendarDays size={18} /> Today's Meetings Overview</h2>
                    <p>Meetings scheduled or recorded for today ({dashboard?.today_date_display})</p>
                  </div>
                  <button className="text-btn" onClick={() => setPage('daily')}>
                    View in Daily Register <ArrowUpRight size={15} />
                  </button>
                </div>
                {dashboard?.today_meetings && dashboard.today_meetings.length > 0 ? (
                  <MeetingTable meetings={dashboard.today_meetings} onEdit={openEditMeeting} onDelete={(m) => setDeleteTarget({ type: 'meeting', id: m.id, name: m.meeting_with })} />
                ) : (
                  <div className="empty">No meetings recorded for today yet. Use 'Record Today's Meeting' to add one.</div>
                )}
              </section>
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 2: DAILY CEO REGISTER (Date-Based Meeting Management) */}
          {/* ========================================================================= */}
          {page === 'daily' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">DAILY CEO REGISTER</p>
                  <h1>Executive Meeting Management</h1>
                  <p className="subheading">
                    Focused view of meetings scheduled or recorded for the day. Does not mix with historical records.
                  </p>
                </div>
                <div className="page-heading-actions">
                  <button className="primary" onClick={() => openNewMeetingForDate(dailyDate)}>
                    <Plus size={16} /> Record Meeting for This Date
                  </button>
                  <button className="secondary" onClick={openNewDaily}>
                    <Plus size={16} /> Quick Daily Note
                  </button>
                </div>
              </div>

              {/* Date Navigation Bar */}
              <div className="date-nav-bar">
                <div className="date-nav-controls">
                  <button className="date-nav-btn" onClick={() => shiftDailyDate(-1)} title="Previous Day">
                    <ChevronLeft size={16} /> Previous Day
                  </button>
                  <button
                    className={`date-nav-btn ${dailyRegister.is_today ? 'today-btn' : ''}`}
                    onClick={jumpToToday}
                  >
                    <Calendar size={15} /> Today
                  </button>
                  <button className="date-nav-btn" onClick={() => shiftDailyDate(1)} title="Next Day">
                    Next Day <ChevronRight size={16} />
                  </button>
                </div>

                <div className="date-indicator">
                  <h2>{dailyRegister.date_display || dailyDate}</h2>
                  {dailyRegister.is_today ? (
                    <span className="date-badge today">● Today's Active Register</span>
                  ) : (
                    <span className="date-badge history">Historical / Scheduled Register</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#718096' }}>Jump to:</span>
                  <input
                    type="date"
                    className="date-picker-input"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Daily Register Summary Metrics */}
              <div className="metric-grid" style={{ marginBottom: '16px' }}>
                <Metric
                  label="Meetings Today"
                  value={dailyRegister.total_meetings || 0}
                  icon={<CalendarDays />}
                  accent="blue"
                  note={`Recorded for ${dailyRegister.date_display || dailyDate}`}
                />
                <Metric
                  label="Actions Generated"
                  value={dailyRegister.total_tasks_today || 0}
                  icon={<ClipboardList />}
                  accent="amber"
                  note="Tied to today's meetings"
                />
                <Metric
                  label="Executive Notes"
                  value={dailyRegister.daily_entries?.length || 0}
                  icon={<NotebookPen />}
                  accent="green"
                  note="Observations & briefings"
                />
                <Metric
                  label="Reviews Scheduled Today"
                  value={dashboard?.reviews_due_today_count || 0}
                  icon={<Clock3 />}
                  accent="red"
                  note="Follow-ups due in Review section"
                />
              </div>

              {/* Today's Meetings List with Rich Cards */}
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>
                      <CalendarDays size={18} /> Meetings for {dailyRegister.date_display || dailyDate}
                    </h2>
                    <p>Meetings scheduled or conducted on this specific date</p>
                  </div>
                  <button className="primary btn-sm" onClick={() => openNewMeetingForDate(dailyDate)}>
                    <Plus size={14} /> Add Meeting
                  </button>
                </div>

                {dailyRegister.meetings && dailyRegister.meetings.length > 0 ? (
                  <div className="meeting-card-list">
                    {dailyRegister.meetings.map((m: Meeting) => (
                      <div key={m.id} className="meeting-card">
                        <div className="meeting-card-head">
                          <div className="meeting-card-title">
                            <h3>{m.meeting_with}</h3>
                            <div className="meeting-card-tags">
                              {m.start_time && (
                                <span className="tag-pill time">
                                  {m.start_time} {m.end_time ? `– ${m.end_time}` : ''}
                                </span>
                              )}
                              <span className="tag-pill dept">{m.department?.name || 'General Management'}</span>
                              <span className="tag-pill type">{m.meeting_type}</span>
                              {m.location && <span className="tag-pill loc">{m.location}</span>}
                              {m.recorded_by && <span className="tag-pill">Recorded by: {m.recorded_by}</span>}
                            </div>
                          </div>

                          <div className="meeting-card-actions">
                            <button
                              className="secondary btn-sm"
                              onClick={() => openNewTask(m.id, m.department_id || undefined)}
                              title="Assign Task from this Meeting"
                            >
                              <Plus size={13} /> Add Task
                            </button>
                            <button
                              className="secondary btn-sm"
                              onClick={() => openEditMeeting(m)}
                              title="Edit Meeting Details"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button
                              className="danger-btn btn-sm"
                              onClick={() => setDeleteTarget({ type: 'meeting', id: m.id, name: m.meeting_with })}
                              title="Delete Meeting Record"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </div>

                        {/* Meeting Discussion & Decisions */}
                        <div className="meeting-card-body">
                          {m.discussion && (
                            <div className="meeting-detail-row">
                              <b>Discussion Points</b>
                              <p>{m.discussion}</p>
                            </div>
                          )}
                          {m.decisions && (
                            <div className="meeting-detail-row">
                              <b>Decisions Taken</b>
                              <p>{m.decisions}</p>
                            </div>
                          )}
                        </div>

                        {/* Associated Tasks */}
                        {m.tasks && m.tasks.length > 0 && (
                          <div className="meeting-tasks-box">
                            <h4>
                              <span>Assigned Action Items ({m.tasks.length})</span>
                              <small style={{ textTransform: 'none', color: '#a0aec0' }}>Click task to edit</small>
                            </h4>
                            {m.tasks.map((t: Task) => (
                              <div
                                key={t.id}
                                className="meeting-task-item"
                                onClick={() => editTask(t)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div style={{ flex: 1 }}>
                                  <b style={{ color: '#2d3748' }}>{t.title}</b>
                                  <div style={{ fontSize: '10px', color: '#718096', marginTop: '2px' }}>
                                    Owner: <strong>{t.assigned_to || 'Unassigned'}</strong> · Deadline:{' '}
                                    {t.deadline || 'None'} · Review Date: <strong>{t.review_date || 'None'}</strong>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
                                  <span className={`status ${statusClass(t.status)}`}>{t.status}</span>
                                  <div className="mini-progress">
                                    <div><span style={{ width: `${t.progress || 0}%` }} /></div>
                                    <small>{t.progress || 0}%</small>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <p style={{ margin: '0 0 10px', fontWeight: 600 }}>No meetings recorded for {dailyRegister.date_display || dailyDate}.</p>
                    <p style={{ margin: 0, fontSize: '11px' }}>
                      Click <strong>"Record Meeting for This Date"</strong> above to capture discussions, decisions and assign actions.
                    </p>
                  </div>
                )}
              </section>

              {/* Daily Executive Notes Section */}
              <section className="panel table-panel">
                <div className="panel-head">
                  <div>
                    <h2><NotebookPen size={18} /> Executive Observations & Daily Entries</h2>
                    <p>Informal briefings, calls, and follow-ups on {dailyRegister.date_display || dailyDate}</p>
                  </div>
                  <button className="secondary btn-sm" onClick={openNewDaily}>
                    <Plus size={14} /> Add Entry
                  </button>
                </div>
                {dailyRegister.daily_entries && dailyRegister.daily_entries.length > 0 ? (
                  <DailyTable daily={dailyRegister.daily_entries} onEdit={editDaily} onDelete={(d) => setDeleteTarget({ type: 'daily', id: d.id, name: d.person_met })} />
                ) : (
                  <div className="empty">No executive journal entries recorded for this date.</div>
                )}
              </section>
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 3: PREVIOUS MEETING REVIEW (Dedicated Section) */}
          {/* ========================================================================= */}
          {page === 'reviews' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ACCOUNTABILITY & FOLLOW-UP</p>
                  <h1>Previous Meeting Review</h1>
                  <p className="subheading">
                    Tasks originating from earlier meetings that have reached their scheduled review date.
                  </p>
                </div>
                <div className="page-heading-actions">
                  <button className="secondary" onClick={() => download('csv', 'reviews')}>
                    <FileSpreadsheet size={16} /> Export Reviews CSV
                  </button>
                </div>
              </div>

              {/* Review Filter Tabs */}
              <div className="review-tab-bar">
                <button
                  className={`review-tab ${reviewFilter === 'due_today' ? 'active' : ''}`}
                  onClick={() => setReviewFilter('due_today')}
                >
                  <Clock3 size={15} />
                  <span>Due Today</span>
                  {dashboard?.reviews_due_today_count > 0 && (
                    <span className="tab-badge">{dashboard.reviews_due_today_count}</span>
                  )}
                </button>

                <button
                  className={`review-tab ${reviewFilter === 'overdue' ? 'active' : ''}`}
                  onClick={() => setReviewFilter('overdue')}
                >
                  <CircleAlert size={15} />
                  <span>Overdue Reviews</span>
                  {dashboard?.reviews_overdue_count > 0 && (
                    <span className="tab-badge danger">{dashboard.reviews_overdue_count}</span>
                  )}
                </button>

                <button
                  className={`review-tab ${reviewFilter === 'upcoming' ? 'active' : ''}`}
                  onClick={() => setReviewFilter('upcoming')}
                >
                  <Calendar size={15} />
                  <span>Upcoming Reviews</span>
                </button>

                <button
                  className={`review-tab ${reviewFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setReviewFilter('all')}
                >
                  <ClipboardList size={15} />
                  <span>All Pending Reviews</span>
                </button>

                <button
                  className={`review-tab ${reviewFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setReviewFilter('completed')}
                >
                  <CheckCircle2 size={15} />
                  <span>Completed Reviews</span>
                </button>
              </div>

              {/* Search & Department Toolbar */}
              <div className="toolbar">
                <div className="searchbox">
                  <Search size={16} />
                  <input
                    placeholder="Search by task title, responsible owner, or meeting context..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                  <option>All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Review Cards List */}
              {filteredReviews.length > 0 ? (
                <div className="review-card-list">
                  {filteredReviews.map((item) => (
                    <div key={item.id} className="review-card">
                      {/* Top Bar with Status and Priority */}
                      <div className="review-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className={`status ${statusClass(item.status)}`}>{item.status}</span>
                          <span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span>
                          <span className="tag-pill dept">{item.department_name}</span>
                          {item.is_due_today && (
                            <span className="tag-pill time" style={{ background: '#e6fffa', color: '#234e52', fontWeight: 700 }}>
                              ● Due for Review Today
                            </span>
                          )}
                          {item.is_overdue && (
                            <span className="tag-pill" style={{ background: '#fff5f5', color: '#c53030', fontWeight: 700 }}>
                              ▲ Overdue by {item.days_overdue} days
                            </span>
                          )}
                        </div>

                        <div className="mini-progress" style={{ minWidth: '130px' }}>
                          <div><span style={{ width: `${item.progress}%` }} /></div>
                          <small style={{ fontWeight: 700, color: '#2d3748' }}>{item.progress}% done</small>
                        </div>
                      </div>

                      {/* Originating Meeting Context Callout */}
                      <div className="review-origin-box">
                        <div>
                          <span>Originating Meeting: </span>
                          <strong>{item.meeting_with}</strong>
                          <span style={{ margin: '0 6px', color: '#cbd5e0' }}>|</span>
                          <span>Held on: <strong>{item.meeting_date_display}</strong></span>
                          {item.days_since_meeting !== null && (
                            <span style={{ color: '#718096' }}> ({item.days_since_meeting} days ago)</span>
                          )}
                        </div>
                        {item.meeting_type && <span className="tag-pill">{item.meeting_type}</span>}
                      </div>

                      {/* Assigned Task Title & Action Required */}
                      <div style={{ marginBottom: '12px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '15px', color: '#1a202c', fontFamily: 'Manrope', fontWeight: 800 }}>
                          {item.title}
                        </h3>
                        {item.action_required && (
                          <p style={{ margin: 0, fontSize: '12px', color: '#4a5568', lineHeight: 1.5 }}>
                            <strong>Action Required:</strong> {item.action_required}
                          </p>
                        )}
                      </div>

                      {/* Why Review is Required */}
                      <div className={`review-reason-box ${item.is_due_today ? 'today' : item.is_overdue ? 'overdue' : ''}`}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span><strong>Review Context:</strong> {item.review_reason}</span>
                      </div>

                      {/* Metadata Grid */}
                      <div className="review-meta-grid">
                        <div className="review-meta-item">
                          <small>Assigned To</small>
                          <b>{item.assigned_to || 'Unassigned'}</b>
                        </div>
                        <div className="review-meta-item">
                          <small>Accountable Head</small>
                          <b>{item.accountable || 'Unassigned'}</b>
                        </div>
                        <div className="review-meta-item">
                          <small>Final Deadline</small>
                          <b>{item.deadline || 'No deadline'}</b>
                        </div>
                        <div className="review-meta-item">
                          <small>Scheduled Review</small>
                          <b style={{ color: item.is_due_today ? '#2b6cb0' : item.is_overdue ? '#c53030' : '#2d3748' }}>
                            {item.review_date || 'None'}
                          </b>
                        </div>
                      </div>

                      {/* Last Update Note if any */}
                      {item.last_update && (
                        <div style={{ fontSize: '11px', color: '#718096', marginBottom: '12px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px' }}>
                          <strong>Last Update:</strong> {item.last_update}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="review-action-row">
                        <div style={{ fontSize: '11px', color: '#a0aec0' }}>
                          Task ID: ACT-{String(item.task_id).padStart(4, '0')} · Meeting MTG-{String(item.meeting_id).padStart(4, '0')}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="secondary btn-sm"
                            onClick={() => {
                              const t = tasks.find((x) => x.id === item.task_id);
                              if (t) editTask(t);
                            }}
                          >
                            <Edit3 size={13} /> Full Edit
                          </button>
                          <button
                            className="primary btn-sm"
                            onClick={() => openQuickReviewModal(item)}
                          >
                            <RotateCcw size={13} /> Review & Follow Up
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty panel">
                  <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '14px', color: '#2d3748' }}>
                    No reviews matching '{reviewFilter.replace('_', ' ')}'.
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#718096' }}>
                    Tasks assigned with a review date will appear here automatically when their review milestone arrives.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 4: MEETINGS (ALL & HISTORICAL MEETINGS) */}
          {/* ========================================================================= */}
          {page === 'meetings' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">MEETING REGISTER</p>
                  <h1>Meetings (All & Historical)</h1>
                  <p className="subheading">
                    Complete meeting repository across all dates. Use to view past discussions or upcoming scheduled sessions.
                  </p>
                </div>
                <div className="page-heading-actions">
                  <button className="primary" onClick={() => openNewMeetingForDate()}>
                    <Plus size={16} /> Record New Meeting
                  </button>
                </div>
              </div>

              {/* Meeting Filter Tabs */}
              <div className="review-tab-bar">
                <button
                  className={`review-tab ${meetingFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setMeetingFilter('all')}
                >
                  All Meetings
                </button>
                <button
                  className={`review-tab ${meetingFilter === 'today' ? 'active' : ''}`}
                  onClick={() => setMeetingFilter('today')}
                >
                  Today's Meetings
                </button>
                <button
                  className={`review-tab ${meetingFilter === 'upcoming' ? 'active' : ''}`}
                  onClick={() => setMeetingFilter('upcoming')}
                >
                  Upcoming Scheduled
                </button>
                <button
                  className={`review-tab ${meetingFilter === 'past' ? 'active' : ''}`}
                  onClick={() => setMeetingFilter('past')}
                >
                  Past Meetings / Done
                </button>
              </div>

              <div className="toolbar">
                <div className="searchbox">
                  <Search size={16} />
                  <input
                    placeholder="Search by meeting attendees, department, decisions..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                  <option>All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <section className="panel table-panel">
                <MeetingTable
                  meetings={filteredMeetings}
                  onEdit={openEditMeeting}
                  onDelete={(m) => setDeleteTarget({ type: 'meeting', id: m.id, name: m.meeting_with })}
                  full
                />
              </section>
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 5: ACTION TRACKER */}
          {/* ========================================================================= */}
          {page === 'tasks' && (
            <>
              <PageHeader
                eyebrow="ACCOUNTABILITY"
                title="Central Action Tracker"
                description="Track ownership, progress, deadlines and scheduled review dates."
                action="Assign task"
                onAction={() => openNewTask()}
              />
              <div className="toolbar">
                <div className="searchbox">
                  <Search size={16} />
                  <input
                    placeholder="Search tasks, owners, departments, action required..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option>All Status</option>
                  {['Not Started', 'In Progress', 'Under Review', 'Completed', 'On Hold'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                  <option>All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <section className="panel table-panel">
                <TaskTable tasks={filteredTasks} onEdit={editTask} full />
              </section>
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 6: DEPARTMENTS */}
          {/* ========================================================================= */}
          {page === 'departments' && (
            <>
              <PageHeader
                eyebrow="ORGANISATION"
                title="Department Registers"
                description="View task and meeting activity grouped by department."
              />
              <div className="department-grid">
                {departments.map((d) => {
                  const dt = tasks.filter((t) => t.department_id === d.id);
                  const dm = meetings.filter((m) => m.department_id === d.id);
                  return (
                    <div
                      className="department-card"
                      key={d.id}
                      onClick={() => {
                        setPage('tasks');
                        setFilterDept(d.name);
                      }}
                    >
                      <div className="dept-icon"><Building2 size={20} /></div>
                      <div>
                        <h3>{d.name}</h3>
                        <small>{dm.length} meetings · {dt.length} actions</small>
                      </div>
                      <div className="dept-count">
                        <b>{dt.filter((t) => t.status !== 'Completed').length}</b>
                        <small>open actions</small>
                      </div>
                      <ArrowUpRight size={16} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* PAGE 7: REPORTS */}
          {/* ========================================================================= */}
          {page === 'reports' && (
            <>
              <PageHeader
                eyebrow="REPORTING & EXPORTS"
                title="Management Reports"
                description="Export live meeting reviews, task tracking, and executive records."
              />
              <div className="report-grid">
                <ReportCard
                  icon={<FileSpreadsheet />}
                  title="Previous Meeting Reviews (CSV)"
                  desc="Detailed dataset of earlier meetings and tasks due for follow-up review."
                  button="Download Reviews CSV"
                  onClick={() => download('csv', 'reviews')}
                />
                <ReportCard
                  icon={<FileSpreadsheet />}
                  title="Central Action Tracker (CSV)"
                  desc="Editable dataset with task owners, status, priority, deadlines and review dates."
                  button="Download Tasks CSV"
                  onClick={() => download('csv', 'tasks')}
                />
                <ReportCard
                  icon={<ClipboardList />}
                  title="Executive Action Tracker (PDF)"
                  desc="A print-ready action tracker report for meetings and executive circulation."
                  button="Download Tasks PDF"
                  onClick={() => download('pdf', 'tasks')}
                />
                <ReportCard
                  icon={<CalendarDays />}
                  title="Departmental Review Summary"
                  desc="High-level completion overview across all 12 operational departments."
                  button="Export Available in Next Build"
                  disabled
                />
                <ReportCard
                  icon={<Trash2 color="#dc3545" />}
                  title="Clear All Testing / Demo Data"
                  desc="Permanently wipe all demo meetings and dummy tasks so your system remains completely clean."
                  button="Purge Testing Data"
                  onClick={async () => {
                    if (window.confirm("Are you sure you want to permanently clear all demo/testing data? Your database will be completely fresh and clean.")) {
                      try {
                        await fetch(`${API}/admin/clear-demo-data`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        alert("Testing data cleared! System is now completely clean.");
                        refresh();
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: RECORD / EDIT MEETING */}
      {/* ========================================================================= */}
      {modal === 'meeting' && (
        <Modal
          title={editId ? `Edit Meeting (MTG-${editId})` : 'Record Meeting'}
          onClose={() => { setModal(''); setEditId(null); }}
        >
          <form onSubmit={saveMeeting} className="form-grid">
            <Field label="Meeting Date">
              <input
                type="date"
                required
                value={meetingForm.meeting_date}
                onChange={(e) => setMeetingForm({ ...meetingForm, meeting_date: e.target.value })}
              />
            </Field>
            <Field label="Department">
              <select
                value={meetingForm.department_id}
                onChange={(e) => setMeetingForm({ ...meetingForm, department_id: e.target.value })}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Start Time">
              <input
                type="time"
                value={meetingForm.start_time}
                onChange={(e) => setMeetingForm({ ...meetingForm, start_time: e.target.value })}
              />
            </Field>
            <Field label="End Time">
              <input
                type="time"
                value={meetingForm.end_time}
                onChange={(e) => setMeetingForm({ ...meetingForm, end_time: e.target.value })}
              />
            </Field>
            <Field label="Meeting With (Team / Person)" wide>
              <input
                required
                placeholder="e.g. Operations Review Team, Warehouse Head, Buyer Representative..."
                value={meetingForm.meeting_with}
                onChange={(e) => setMeetingForm({ ...meetingForm, meeting_with: e.target.value })}
              />
            </Field>
            <Field label="Meeting Type">
              <select
                value={meetingForm.meeting_type}
                onChange={(e) => setMeetingForm({ ...meetingForm, meeting_type: e.target.value })}
              >
                {['Review', 'Operational', 'Strategic', 'Follow-up', 'Emergency', 'Other'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                placeholder="CEO Office, Boardroom, Online..."
                value={meetingForm.location}
                onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })}
              />
            </Field>
            <Field label="Key Discussion Points" wide>
              <textarea
                rows={3}
                placeholder="Summarize key topics reviewed during this meeting..."
                value={meetingForm.discussion}
                onChange={(e) => setMeetingForm({ ...meetingForm, discussion: e.target.value })}
              />
            </Field>
            <Field label="Decisions Taken" wide>
              <textarea
                rows={3}
                placeholder="Key executive decisions taken, policy approvals, or agreed directions..."
                value={meetingForm.decisions}
                onChange={(e) => setMeetingForm({ ...meetingForm, decisions: e.target.value })}
              />
            </Field>
            <Field label="Next Scheduled Meeting / Review Date">
              <input
                type="date"
                value={meetingForm.next_review_date}
                onChange={(e) => setMeetingForm({ ...meetingForm, next_review_date: e.target.value })}
              />
            </Field>
            <Field label="Recorded By">
              <input
                value={meetingForm.recorded_by}
                onChange={(e) => setMeetingForm({ ...meetingForm, recorded_by: e.target.value })}
              />
            </Field>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => { setModal(''); setEditId(null); }}>
                Cancel
              </button>
              <button className="primary">{editId ? 'Save Changes' : 'Save Meeting'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK REVIEW & FOLLOW UP (From Previous Meeting Review) */}
      {/* ========================================================================= */}
      {modal === 'quick_review' && activeReview && (
        <Modal
          title={`Follow-up & Review: ${activeReview.title}`}
          onClose={() => { setModal(''); setActiveReview(null); }}
        >
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '11px', color: '#4a5568' }}>
            <div><strong>Originating Meeting:</strong> {activeReview.meeting_with} ({activeReview.meeting_date_display})</div>
            <div style={{ marginTop: '3px' }}><strong>Action Required:</strong> {activeReview.action_required}</div>
            <div style={{ marginTop: '3px' }}><strong>Responsible:</strong> {activeReview.assigned_to} · <strong>Accountable:</strong> {activeReview.accountable}</div>
          </div>
          <form onSubmit={saveQuickReview} className="form-grid">
            <Field label="Current Progress %">
              <input
                type="number"
                min="0"
                max="100"
                required
                value={reviewForm.progress}
                onChange={(e) => setReviewForm({ ...reviewForm, progress: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                value={reviewForm.status}
                onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value })}
              >
                {['In Progress', 'Under Review', 'Completed', 'On Hold', 'Not Started'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Schedule Next Follow-up Review Date (Optional)">
              <input
                type="date"
                value={reviewForm.next_review_date}
                onChange={(e) => setReviewForm({ ...reviewForm, next_review_date: e.target.value })}
              />
            </Field>
            <Field label="Review Notes / Progress Logged Today" wide>
              <textarea
                rows={3}
                required
                placeholder="What progress was confirmed today? Are deliverables on track? Any bottlenecks discussed?"
                value={reviewForm.review_notes}
                onChange={(e) => setReviewForm({ ...reviewForm, review_notes: e.target.value })}
              />
            </Field>
            <Field label="Executive Remarks / Directives" wide>
              <textarea
                rows={2}
                placeholder="CEO remarks, directives, or conditions for closure..."
                value={reviewForm.remarks}
                onChange={(e) => setReviewForm({ ...reviewForm, remarks: e.target.value })}
              />
            </Field>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => { setModal(''); setActiveReview(null); }}>
                Cancel
              </button>
              <button className="primary">Confirm Review & Update</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE / EDIT TASK */}
      {/* ========================================================================= */}
      {modal === 'task' && (
        <Modal
          title={editId ? 'Edit Action Item' : 'Assign New Action Item'}
          onClose={() => { setModal(''); setEditId(null); }}
        >
          <form onSubmit={saveTask} className="form-grid">
            <Field label="Task Title" wide>
              <input
                required
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </Field>
            <Field label="Originating Meeting">
              <select
                value={taskForm.meeting_id}
                onChange={(e) => setTaskForm({ ...taskForm, meeting_id: e.target.value })}
              >
                <option value="">Standalone Directive</option>
                {meetings.map((m) => (
                  <option value={m.id} key={m.id}>
                    MTG-{m.id} · {m.meeting_with} ({m.meeting_date})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                value={taskForm.department_id}
                onChange={(e) => setTaskForm({ ...taskForm, department_id: e.target.value })}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned To (Primary Owner)">
              <input
                value={taskForm.assigned_to}
                onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
              />
            </Field>
            <Field label="Accountable Authority (Head of Dept)">
              <input
                value={taskForm.accountable}
                onChange={(e) => setTaskForm({ ...taskForm, accountable: e.target.value })}
              />
            </Field>
            <Field label="Priority">
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              >
                {['Low', 'Medium', 'High', 'Critical'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={taskForm.status}
                onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
              >
                {['Not Started', 'In Progress', 'Under Review', 'Completed', 'On Hold'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Progress %">
              <input
                type="number"
                min="0"
                max="100"
                value={taskForm.progress}
                onChange={(e) => setTaskForm({ ...taskForm, progress: e.target.value })}
              />
            </Field>
            <Field label="Final Deadline">
              <input
                type="date"
                value={taskForm.deadline}
                onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
              />
            </Field>
            <Field label="Scheduled Follow-up Review Date">
              <input
                type="date"
                value={taskForm.review_date}
                onChange={(e) => setTaskForm({ ...taskForm, review_date: e.target.value })}
              />
            </Field>
            <Field label="Discussion Background" wide>
              <textarea
                rows={2}
                value={taskForm.discussion}
                onChange={(e) => setTaskForm({ ...taskForm, discussion: e.target.value })}
              />
            </Field>
            <Field label="Action Required (Clear Deliverable)" wide>
              <textarea
                rows={3}
                value={taskForm.action_required}
                onChange={(e) => setTaskForm({ ...taskForm, action_required: e.target.value })}
              />
            </Field>
            <Field label="Remarks" wide>
              <textarea
                rows={2}
                value={taskForm.remarks}
                onChange={(e) => setTaskForm({ ...taskForm, remarks: e.target.value })}
              />
            </Field>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => { setModal(''); setEditId(null); }}>
                Cancel
              </button>
              <button className="primary">{editId ? 'Save Changes' : 'Assign Task'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CREATE / EDIT DAILY JOURNAL ENTRY */}
      {/* ========================================================================= */}
      {modal === 'daily' && (
        <Modal
          title={editId ? 'Edit Daily Entry' : 'Daily Executive Register Entry'}
          onClose={() => { setModal(''); setEditId(null); }}
        >
          <form onSubmit={saveDaily} className="form-grid">
            <Field label="Date">
              <input
                type="date"
                required
                value={dailyForm.entry_date}
                onChange={(e) => setDailyForm({ ...dailyForm, entry_date: e.target.value })}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={dailyForm.entry_time}
                onChange={(e) => setDailyForm({ ...dailyForm, entry_time: e.target.value })}
              />
            </Field>
            <Field label="Activity Type">
              <select
                value={dailyForm.activity_type}
                onChange={(e) => setDailyForm({ ...dailyForm, activity_type: e.target.value })}
              >
                {['Discussion', 'Briefing', 'Meeting', 'Review', 'Visit', 'Decision', 'Other'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Person / Team Met">
              <input
                value={dailyForm.person_met}
                onChange={(e) => setDailyForm({ ...dailyForm, person_met: e.target.value })}
              />
            </Field>
            <Field label="Department">
              <select
                value={dailyForm.department_id}
                onChange={(e) => setDailyForm({ ...dailyForm, department_id: e.target.value })}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Follow-up Required">
              <select
                value={dailyForm.follow_up_required}
                onChange={(e) => setDailyForm({ ...dailyForm, follow_up_required: e.target.value })}
              >
                <option>No</option>
                <option>Yes</option>
              </select>
            </Field>
            <Field label="Follow-up Review Date">
              <input
                type="date"
                value={dailyForm.review_date}
                onChange={(e) => setDailyForm({ ...dailyForm, review_date: e.target.value })}
              />
            </Field>
            <Field label="Discussion Points" wide>
              <textarea
                rows={3}
                value={dailyForm.discussion}
                onChange={(e) => setDailyForm({ ...dailyForm, discussion: e.target.value })}
              />
            </Field>
            <Field label="Decision Taken" wide>
              <textarea
                rows={3}
                value={dailyForm.decision}
                onChange={(e) => setDailyForm({ ...dailyForm, decision: e.target.value })}
              />
            </Field>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => { setModal(''); setEditId(null); }}>
                Cancel
              </button>
              <button className="primary">{editId ? 'Save Changes' : 'Save Entry'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <Modal
          title={`Confirm Permanent Deletion`}
          onClose={() => setDeleteTarget(null)}
        >
          <div style={{ padding: '6px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#c53030', marginBottom: '12px' }}>
              <AlertTriangle size={24} />
              <strong style={{ fontSize: '15px' }}>
                Are you sure you want to permanently delete this {deleteTarget.type}?
              </strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#4a5568' }}>
              Record: <strong>{deleteTarget.name}</strong> (ID: {deleteTarget.id})
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#718096', lineHeight: 1.5 }}>
              {deleteTarget.type === 'meeting'
                ? 'Deleting this meeting will also remove tasks specifically tied to it. Unrelated meetings and historical data will not be affected.'
                : 'This action cannot be undone and will be logged in the system audit trail.'}
            </p>
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="danger-btn solid" onClick={confirmDelete}>
              <Trash2 size={15} /> Yes, Delete Record
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Subcomponents
function Metric({ label, value, icon, accent, note }: any) {
  return (
    <div className={`metric ${accent}`}>
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action, onAction }: any) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="subheading">{description}</p>
      </div>
      {action && (
        <button className="primary" onClick={onAction}>
          <Plus size={16} /> {action}
        </button>
      )}
    </div>
  );
}

function TaskTable({ tasks, onEdit, full }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task / Action</th>
            <th>Department</th>
            <th>Assigned To</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Deadline</th>
            {full && <th>Review Date</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t: Task) => (
            <tr key={t.id} onClick={() => onEdit(t)}>
              <td>
                <div className="task-title">
                  <b>{t.title}</b>
                  <small>ACT-{String(t.id).padStart(4, '0')}{t.meeting_id ? ` · MTG-${t.meeting_id}` : ''}</small>
                </div>
              </td>
              <td>{t.department?.name || '—'}</td>
              <td>{t.assigned_to || '—'}</td>
              <td><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
              <td><span className={`status ${statusClass(t.status)}`}>{t.status}</span></td>
              <td>
                <div className="mini-progress">
                  <div><span style={{ width: `${t.progress || 0}%` }} /></div>
                  <small>{t.progress || 0}%</small>
                </div>
              </td>
              <td>{t.deadline || '—'}</td>
              {full && <td>{t.review_date || '—'}</td>}
            </tr>
          ))}
          {!tasks.length && (
            <tr>
              <td colSpan={full ? 8 : 7} className="empty">No tasks found matching criteria.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MeetingTable({ meetings, onEdit, onDelete, full }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Meeting Attendees</th>
            <th>Date & Time</th>
            <th>Department</th>
            <th>Meeting Type</th>
            <th>Tasks Generated</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m: Meeting) => (
            <tr key={m.id}>
              <td>
                <div className="task-title" onClick={() => onEdit(m)} style={{ cursor: 'pointer' }}>
                  <b>{m.meeting_with}</b>
                  <small>MTG-{String(m.id).padStart(4, '0')} · {m.location || 'CEO Office'}</small>
                </div>
              </td>
              <td>
                {m.meeting_date}
                <small className="cell-sub">{m.start_time || '—'}{m.end_time ? ` – ${m.end_time}` : ''}</small>
              </td>
              <td>{m.department?.name || '—'}</td>
              <td><span className="tag-pill type">{m.meeting_type}</span></td>
              <td><span className="tag-pill">{m.tasks?.length ?? 0} actions</span></td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  <button className="secondary btn-sm" onClick={() => onEdit(m)} title="Edit Meeting">
                    <Edit3 size={13} />
                  </button>
                  <button className="danger-btn btn-sm" onClick={() => onDelete(m)} title="Delete Meeting">
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!meetings.length && (
            <tr>
              <td colSpan={6} className="empty">No meeting records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ daily, onEdit, onDelete }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Activity</th>
            <th>Person Met</th>
            <th>Department</th>
            <th>Follow-up</th>
            <th>Review Date</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d: DailyEntry) => (
            <tr key={d.id}>
              <td>
                {d.entry_date}
                <small className="cell-sub">{d.entry_time || '—'}</small>
              </td>
              <td><span className="tag-pill type">{d.activity_type}</span></td>
              <td>
                <div className="task-title" onClick={() => onEdit(d)} style={{ cursor: 'pointer' }}>
                  <b>{d.person_met || '—'}</b>
                  <small>{d.discussion}</small>
                </div>
              </td>
              <td>{d.department?.name || '—'}</td>
              <td>{d.follow_up_required}</td>
              <td>{d.review_date || '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  <button className="secondary btn-sm" onClick={() => onEdit(d)}>
                    <Edit3 size={13} />
                  </button>
                  <button className="danger-btn btn-sm" onClick={() => onDelete(d)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!daily.length && (
            <tr>
              <td colSpan={7} className="empty">No daily entries found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportCard({ icon, title, desc, button, onClick, disabled }: any) {
  return (
    <div className="report-card">
      <div className="report-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <button className={disabled ? 'secondary' : 'primary'} disabled={disabled} onClick={onClick}>
        {button}
      </button>
    </div>
  );
}

function Field({ label, children, wide }: any) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
