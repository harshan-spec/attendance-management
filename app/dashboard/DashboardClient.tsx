"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAttendlyAuth } from "@/lib/auth-context";
import { afterAttending, afterMissing, classesNeeded, classesToAttendWithinUpcoming, dateKey, formatDate, formatDay, formatPercentage, getHealth, getRecordStatus, getSubjectTotals, getTotals, localDate } from "@/lib/attendance";
import { createSampleWorkspace } from "@/lib/sample-data";
import type { AttendanceRecord, Semester, Subject, TimetableEntry, WorkspaceData, WorkspaceSettings } from "@/lib/types";
import { getStudyYearLabel, SVCE_FALLBACK_OPTIONS, type CollegeSelectOption, type StudentAcademicProfile, type SvceTimetableOptions } from "@/lib/svce-timetable";
import { renderTimetablePdfPages } from "@/lib/svce-timetable-render";
import { readCachedCollegeTimetable, writeCachedCollegeTimetable } from "@/lib/college-timetable-cache";
import { createId } from "@/lib/id";
import { Icon, type IconName } from "@/app/dashboard/Icons";
import { PublicLegalLinks } from "@/app/legal/PublicLegalLinks";

type ViewKey = "overview" | "subjects" | "attendance" | "calendar" | "timetable" | "planner" | "reports" | "semesters" | "settings";
type DialogState =
  | { kind: "attendance"; record?: AttendanceRecord; subjectId?: string; date?: string }
  | { kind: "whole-day-attendance"; date?: string }
  | { kind: "subject"; subject?: Subject }
  | { kind: "semester" }
  | { kind: "delete-record"; record: AttendanceRecord }
  | { kind: "archive-subject"; subject: Subject }
  | { kind: "archive-semester"; semester: Semester }
  | { kind: "delete-account" }
  | null;

const viewMeta: Record<ViewKey, { title: string; subtitle: string; icon: IconName }> = {
  overview: { title: "Overview", subtitle: "A clear picture of where you stand this semester.", icon: "home" },
  subjects: { title: "Your subjects", subtitle: "Keep every subject above its 75% attendance floor.", icon: "book" },
  attendance: { title: "Class history", subtitle: "Every class, with its date, day, periods, and status.", icon: "clock" },
  calendar: { title: "Calendar", subtitle: "Review recorded attendance by date.", icon: "calendar" },
  timetable: { title: "Timetable", subtitle: "Plan seven class hours each weekday, Monday through Friday.", icon: "book-open" },
  planner: { title: "Plan ahead", subtitle: "See what future classes could change before they happen.", icon: "target" },
  reports: { title: "Semester report", subtitle: "A subject-by-subject summary you can take with you.", icon: "chart" },
  semesters: { title: "Semesters", subtitle: "Keep current classes and past terms organized.", icon: "layers" },
  settings: { title: "Settings", subtitle: "Set the attendance floors you want to stay above.", icon: "settings" },
};

const navItems: { key: ViewKey; label: string; icon: IconName; mobileHide?: boolean }[] = [
  { key: "overview", label: "Overview", icon: "home" },
  { key: "subjects", label: "Subjects", icon: "book" },
  { key: "attendance", label: "Attendance", icon: "clock" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "timetable", label: "Timetable", icon: "book-open" },
  { key: "planner", label: "Planner", icon: "target" },
  { key: "reports", label: "Reports", icon: "chart", mobileHide: true },
  { key: "semesters", label: "Semesters", icon: "layers", mobileHide: true },
  { key: "settings", label: "Settings", icon: "settings", mobileHide: true },
];

function blankWorkspace(academicProfile?: StudentAcademicProfile | null): WorkspaceData {
  const id = createId();
  return {
    semesters: [{ id, name: academicProfile ? `Semester ${String(academicProfile.semester).padStart(2, "0")}` : "My first semester", startDate: dateKey(new Date()), endDate: "", archived: false, ...(academicProfile ? { academicProfile } : {}) }],
    activeSemesterId: id,
    subjects: [],
    records: [],
    timetable: [],
    settings: { overallTarget: 80, defaultSubjectTarget: 75, theme: "light" },
  };
}

function loadPreviewWorkspace(userId: string): WorkspaceData {
  try {
    const saved = localStorage.getItem(`attendly-workspace:${userId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as WorkspaceData;
      return {
        ...parsed,
        subjects: (Array.isArray(parsed.subjects) ? parsed.subjects : []).map(({ id, semesterId, name, code, requiredAttendance, color, archived }) => ({
          id, semesterId, name, code, requiredAttendance, color, archived,
        })),
        timetable: Array.isArray(parsed.timetable) ? parsed.timetable : [],
      };
    }
  } catch {
    try { localStorage.removeItem(`attendly-workspace:${userId}`); } catch { /* The sample workspace is still usable without browser storage. */ }
  }
  return createSampleWorkspace();
}

export function DashboardClient() {
  const router = useRouter();
  const { user, ready, signOut, enterPreview, deleteAccount: removeAccount } = useAttendlyAuth();
  const userId = user?.id ?? "";
  const userIsPreview = user?.isPreview ?? false;
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loadedUserId, setLoadedUserId] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"local" | "saving" | "saved" | "error">("saved");
  const [view, setView] = useState<ViewKey>("overview");
  const [reportSubjectId, setReportSubjectId] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const lastSavedWorkspaceRef = useRef({ userId: "", serialized: "" });

  useEffect(() => {
    saveRevisionRef.current += 1;
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      if (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("preview") === "1") {
        enterPreview();
        return;
      }
      router.replace("/login");
      return;
    }
    setData(null);
    setLoadedUserId("");
    setWorkspaceError("");
    lastSavedWorkspaceRef.current = { userId: "", serialized: "" };
    if (userIsPreview) {
      setData(loadPreviewWorkspace(user.id));
      setLoadedUserId(user.id);
      setSaveStatus("local");
      return;
    }

    let alive = true;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { workspace?: WorkspaceData | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Your workspace could not be loaded.");
        if (!alive) return;
        const workspace = payload.workspace?.semesters.length ? payload.workspace : blankWorkspace(user.academicProfile);
        lastSavedWorkspaceRef.current = {
          userId,
          serialized: payload.workspace?.semesters.length ? JSON.stringify(workspace) : "",
        };
        setData(workspace);
        setLoadedUserId(userId);
      })
      .catch((caught: unknown) => {
        if (alive) setWorkspaceError(caught instanceof Error ? caught.message : "Your workspace could not be loaded.");
      });
    return () => { alive = false; };
  }, [ready, userId, userIsPreview, router, loadAttempt, enterPreview]);

  useEffect(() => {
    if (!userId || !data || loadedUserId !== userId || signingOut) return;
    if (userIsPreview) {
      try {
        localStorage.setItem(`attendly-workspace:${userId}`, JSON.stringify(data));
        setSaveStatus("local");
      } catch {
        setSaveStatus("error");
      }
      return;
    }

    const serialized = JSON.stringify(data);
    if (lastSavedWorkspaceRef.current.userId === userId && lastSavedWorkspaceRef.current.serialized === serialized) {
      setSaveStatus("saved");
      return;
    }

    const revision = ++saveRevisionRef.current;
    const timer = window.setTimeout(async () => {
      const persist = async () => {
        if (revision !== saveRevisionRef.current) return;
        setSaveStatus("saving");
        const response = await fetch("/api/workspace", {
          method: "PUT",
          signal: AbortSignal.timeout(15_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: data }),
        });
        if (!response.ok) throw new Error("Could not sync your changes.");
        lastSavedWorkspaceRef.current = { userId, serialized };
        if (revision === saveRevisionRef.current) setSaveStatus("saved");
      };
      saveQueueRef.current = saveQueueRef.current
        .then(persist, persist)
        .catch(() => {
          if (revision === saveRevisionRef.current) setSaveStatus("error");
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [userId, userIsPreview, data, loadedUserId, signingOut]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeSemester = data?.semesters.find((semester) => semester.id === data.activeSemesterId && !semester.archived)
    ?? data?.semesters.find((semester) => !semester.archived)
    ?? data?.semesters[0]
    ?? null;
  const semesterSubjects = useMemo(
    () => data?.subjects.filter((subject) => subject.semesterId === activeSemester?.id) ?? [],
    [data?.subjects, activeSemester?.id],
  );
  const currentSubjects = semesterSubjects.filter((subject) => !subject.archived);
  const selectedReportSubjectId = currentSubjects.some((subject) => subject.id === reportSubjectId) ? reportSubjectId : "";
  const currentSubjectIds = new Set(currentSubjects.map((subject) => subject.id));
  const semesterSubjectIds = new Set(semesterSubjects.map((subject) => subject.id));
  const activeRecords = (data?.records ?? []).filter((record) => currentSubjectIds.has(record.subjectId));
  const semesterRecords = (data?.records ?? []).filter((record) => semesterSubjectIds.has(record.subjectId));
  const totals = getTotals(activeRecords);
  const missingSubjects = currentSubjects.filter((subject) => {
    const summary = getSubjectTotals(activeRecords, subject.id);
    return summary.percentage !== null && summary.percentage < subject.requiredAttendance;
  });

  function notify(message: string) { setToast(message); }
  function updateData(change: (current: WorkspaceData) => WorkspaceData) {
    setData((current) => current ? change(current) : current);
  }
  function retryWorkspaceSave() {
    setData((current) => current ? { ...current } : current);
  }
  function openAttendance(subjectId?: string, date?: string) {
    if (!currentSubjects.length) {
      setDialog({ kind: "subject" });
      notify("Add a subject before logging a class.");
      return;
    }
    setDialog({ kind: "attendance", subjectId, date });
  }
  function openWholeDayAttendance(date?: string) {
    if (!currentSubjects.length) {
      setDialog({ kind: "subject" });
      notify("Add a subject and fill in your weekly timetable before marking a whole day.");
      return;
    }
    setDialog({ kind: "whole-day-attendance", date });
  }
  function quickLog(subjectId: string, status: "present" | "absent") {
    const subject = currentSubjects.find((entry) => entry.id === subjectId);
    if (!subject) return;
    const today = dateKey(new Date());
    updateData((current) => {
      const matching = current.records.filter((entry) => entry.subjectId === subjectId && entry.date === today);
      const recordedPeriods = matching.reduce((sum, entry) => sum + entry.periods, 0);
      if (recordedPeriods >= 12) {
        return { ...current, records: [...current.records, { id: createId(), subjectId, date: today, periods: 1, attended: status === "present" ? 1 : 0 }] };
      }
      const recordedAttended = matching.reduce((sum, entry) => sum + entry.attended, 0);
      const notes = [...new Set(matching.map((entry) => entry.note?.trim()).filter((note): note is string => Boolean(note)))];
      const note = notes.join(" · ").slice(0, 140);
      const record: AttendanceRecord = {
        id: matching[0]?.id ?? createId(),
        subjectId,
        date: today,
        periods: recordedPeriods + 1,
        attended: recordedAttended + (status === "present" ? 1 : 0),
        ...(note ? { note } : {}),
      };
      const matchingIds = new Set(matching.map((entry) => entry.id));
      return { ...current, records: [...current.records.filter((entry) => !matchingIds.has(entry.id)), record] };
    });
    notify(`${status === "present" ? "Present" : "Absent"} added for ${subject.name} on ${formatDay(today)}. Existing attendance for this date was kept.`);
  }
  function saveAttendance(record: AttendanceRecord) {
    updateData((current) => ({
      ...current,
      records: dialog?.kind === "attendance" && dialog.record
        ? current.records.map((entry) => entry.id === record.id ? record : entry)
        : [...current.records, record],
    }));
    setDialog(null);
    notify(dialog?.kind === "attendance" && dialog.record ? "Attendance record updated." : "Attendance recorded for the selected day.");
  }
  function saveWholeDayAttendance(date: string, status: "present" | "absent") {
    if (!data || !activeSemester) return;
    const weekday = localDate(date).getDay();
    const activeSubjectIds = new Set(currentSubjects.map((subject) => subject.id));
    const scheduledHours = new Map<string, Set<number>>();
    for (const entry of data.timetable) {
      if (entry.semesterId !== activeSemester.id || entry.weekday !== weekday || !activeSubjectIds.has(entry.subjectId)) continue;
      const hours = scheduledHours.get(entry.subjectId) ?? new Set<number>();
      hours.add(entry.hour);
      scheduledHours.set(entry.subjectId, hours);
    }
    if (!scheduledHours.size) {
      notify(`No saved timetable classes for ${formatDay(date)}. Fill in the weekly timetable first.`);
      return;
    }
    const scheduledPeriods = new Map([...scheduledHours].map(([subjectId, hours]) => [subjectId, hours.size]));

    updateData((current) => {
      const subjectIds = new Set(scheduledPeriods.keys());
      const existingForDay = current.records.filter((record) => record.date === date && subjectIds.has(record.subjectId));
      const replacements: AttendanceRecord[] = Array.from(scheduledPeriods, ([subjectId, periods]) => {
        const matches = existingForDay.filter((record) => record.subjectId === subjectId);
        const retainedNotes = [...new Set(matches.map((record) => record.note?.trim()).filter((note): note is string => Boolean(note)))];
        const note = retainedNotes.length ? retainedNotes.join(" · ").slice(0, 140) : matches.length ? undefined : "Whole-day timetable mark";
        return {
          id: matches[0]?.id ?? createId(),
          subjectId,
          date,
          periods,
          attended: status === "present" ? periods : 0,
          ...(note ? { note } : {}),
        };
      });
      return {
        ...current,
        records: [...current.records.filter((record) => record.date !== date || !subjectIds.has(record.subjectId)), ...replacements],
      };
    });

    const totalPeriods = [...scheduledPeriods.values()].reduce((sum, periods) => sum + periods, 0);
    notify(`Marked ${totalPeriods} scheduled ${totalPeriods === 1 ? "period" : "periods"} across ${scheduledPeriods.size} ${scheduledPeriods.size === 1 ? "subject" : "subjects"} ${status} for ${formatDay(date)}, ${formatDate(date)}.`);
    setDialog(null);
  }
  function saveSubject(subject: Subject) {
    updateData((current) => ({
      ...current,
      subjects: dialog?.kind === "subject" && dialog.subject
        ? current.subjects.map((entry) => entry.id === subject.id ? subject : entry)
        : [...current.subjects, subject],
    }));
    setDialog(null);
    notify(dialog?.kind === "subject" && dialog.subject ? "Subject details saved." : "Subject added to this semester.");
  }
  function saveSemester(semester: Semester) {
    updateData((current) => ({ ...current, semesters: [...current.semesters, semester], activeSemesterId: semester.id }));
    setDialog(null);
    setView("timetable");
    notify("Semester created. Loading its college timetable.");
  }
  function setActiveSemester(id: string) {
    if (!data?.semesters.some((semester) => semester.id === id && !semester.archived)) return;
    updateData((current) => ({ ...current, activeSemesterId: id }));
  }
  function toggleArchive(subject: Subject) {
    updateData((current) => ({ ...current, subjects: current.subjects.map((entry) => entry.id === subject.id ? { ...entry, archived: !entry.archived } : entry) }));
    setDialog(null);
    notify(subject.archived ? "Subject restored to this semester." : "Subject archived. Its attendance history is preserved.");
  }
  function toggleArchiveSemester(semester: Semester) {
    if (!semester.archived && (data?.semesters.filter((entry) => !entry.archived).length ?? 0) <= 1) {
      setDialog(null);
      notify("Create or restore another semester before archiving the only active semester.");
      return;
    }
    updateData((current) => {
      const archiving = !semester.archived;
      const semesters = current.semesters.map((entry) => entry.id === semester.id ? { ...entry, archived: archiving } : entry);
      const activeSemesterId = archiving && current.activeSemesterId === semester.id
        ? semesters.find((entry) => entry.id !== semester.id && !entry.archived)?.id ?? current.activeSemesterId
        : current.activeSemesterId;
      return { ...current, semesters, activeSemesterId };
    });
    setDialog(null);
    notify(semester.archived ? "Semester restored. Its subjects and attendance history are available again." : "Semester archived. Its subjects and attendance history are preserved.");
  }
  function deleteRecord(record: AttendanceRecord) {
    updateData((current) => ({ ...current, records: current.records.filter((entry) => entry.id !== record.id) }));
    setDialog(null);
    notify("Attendance record removed.");
  }
  function saveSettings(settings: WorkspaceSettings) {
    updateData((current) => ({ ...current, settings }));
    notify("Your attendance targets and display preference were updated.");
  }
  function saveTimetable(entries: TimetableEntry[]) {
    if (!activeSemester) return;
    updateData((current) => ({
      ...current,
      timetable: [...current.timetable.filter((entry) => entry.semesterId !== activeSemester.id), ...entries],
    }));
    notify("Your weekly timetable was updated.");
  }
  function exportCsv(subjectId = "") {
    if (!data || !activeSemester) return;
    const rows = [["date", "day", "subject", "subject_code", "periods", "attended", "status"]];
    for (const record of activeRecords.filter((record) => !subjectId || record.subjectId === subjectId).sort((a, b) => a.date.localeCompare(b.date))) {
      const subject = semesterSubjects.find((entry) => entry.id === record.subjectId);
      rows.push([record.date, formatDay(record.date), subject?.name ?? "", subject?.code ?? "", String(record.periods), String(record.attended), getRecordStatus(record)]);
    }
    const csv = rows.map((row) => row.map((cell) => {
      const spreadsheetSafeCell = /^[\u0000-\u0020]*[=+\-@]/.test(cell) ? `'${cell}` : cell;
      return `"${spreadsheetSafeCell.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const reportName = subjectId ? `${activeSemester.name}-${currentSubjects.find((subject) => subject.id === subjectId)?.name ?? "subject"}` : activeSemester.name;
    link.download = `${reportName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-attendance.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    notify("Your semester report downloaded as CSV.");
  }
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    saveRevisionRef.current += 1;
    try {
      await saveQueueRef.current;
      if (data && loadedUserId === userId && !userIsPreview) {
        const serialized = JSON.stringify(data);
        if (lastSavedWorkspaceRef.current.userId !== userId || lastSavedWorkspaceRef.current.serialized !== serialized) {
          const response = await fetch("/api/workspace", {
            method: "PUT",
            signal: AbortSignal.timeout(15_000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace: data }),
          });
          if (!response.ok) throw new Error("Your latest changes could not be saved. Please retry before signing out.");
          lastSavedWorkspaceRef.current = { userId, serialized };
          setSaveStatus("saved");
        }
      }
      await signOut();
      router.push("/login");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  async function handleAccountDeletion(password: string) {
    await removeAccount(password);
    try { window.sessionStorage.setItem("attendly-account-deleted", "1"); } catch { /* Account deletion still completes without browser storage. */ }
    setDialog(null);
    router.replace("/login");
  }

  if (signingOut) {
    return <main className="auth-loading"><div className="loading-mark"><Icon name="check" /></div><p>Saving your changes before signing out…</p></main>;
  }
  if (!ready || !user) {
    return <main className="auth-loading"><div className="loading-mark"><Icon name="check" /></div><p>Opening your attendance space…</p></main>;
  }
  if (workspaceError) {
    return <main className="workspace-load-error"><div className="loading-mark"><Icon name="alert" /></div><h1>Couldn’t open your workspace</h1><p>{workspaceError}</p><button className="button button-primary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button></main>;
  }
  if (loadedUserId !== user.id) {
    return <main className="auth-loading"><div className="loading-mark"><Icon name="check" /></div><p>Opening your attendance space…</p></main>;
  }
  if (!data) return null;

  const meta = viewMeta[view];
  const todayLabel = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const greet = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-shell" data-theme={data.settings.theme}>
      <aside className="sidebar">
        <a href="/dashboard" className="brand" aria-label="Attendly overview"><span className="brand-mark"><Icon name="check" /></span><span>attendly<span className="brand-period">.</span></span></a>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.key} className={`side-link ${view === item.key ? "active" : ""}`} data-mobile-hide={item.mobileHide || undefined} onClick={() => { setView(item.key); setAccountMenuOpen(false); }} aria-current={view === item.key ? "page" : undefined}>
              <span className="nav-icon"><Icon name={item.icon} /></span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-spacer" />
        <div className="sidebar-semester">
          <label htmlFor="active-semester">ACTIVE SEMESTER</label>
          <select id="active-semester" value={activeSemester?.id ?? ""} onChange={(event) => setActiveSemester(event.target.value)}>
            {data.semesters.filter((semester) => !semester.archived).map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
          </select>
        </div>
        {user.isPreview && <div className={`preview-status ${saveStatus === "error" ? "error" : ""}`}><span className="status-dot" /><span>{saveStatus === "error" ? "Browser storage is unavailable. Preview changes may not persist after reload." : "Preview data stays in this browser. It isn’t synced to Supabase."}</span></div>}
        {!user.isPreview && <div className={`preview-status workspace-sync ${saveStatus}`} aria-live="polite"><span className="status-dot" /><span>{saveStatus === "saving" ? "Saving changes to your account…" : saveStatus === "error" ? "Couldn’t sync your latest changes." : "Your attendance data syncs to your account."}</span>{saveStatus === "error" && <button type="button" onClick={retryWorkspaceSave}>Retry</button>}</div>}
        <div className="sidebar-profile">
          <span className="avatar">{initials(user.name)}</span>
          <div className="profile-copy"><strong>{user.name}</strong><span>{user.isPreview ? "Preview account" : user.email}</span></div>
          <button className="icon-button profile-menu" onClick={() => setView("settings")} aria-label="Open settings"><Icon name="settings" /></button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left"><span className="topbar-title">Attendly</span><span className="topbar-period"><Icon name="calendar" />{activeSemester?.name ?? "No semester"}</span>{!user.isPreview && <button type="button" className={`sync-indicator ${saveStatus}`} onClick={saveStatus === "error" ? retryWorkspaceSave : undefined} aria-live="polite" title={saveStatus === "error" ? "Retry syncing changes" : undefined}><span className="status-dot"/><span className="sync-indicator-label">{saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Retry sync" : "Saved"}</span></button>}</div>
          <div className="topbar-actions">
            {view !== "overview" && <button className="button button-quiet topbar-log-button" onClick={() => openAttendance()}><Icon name="plus" /><span className="topbar-log-label">Log attendance</span></button>}
            <div className="account-menu-anchor">
              <button className="button button-quiet account-trigger" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen} aria-label="Open account menu"><span className="avatar topbar-avatar">{initials(user.name)}</span><span className="account-trigger-name">{user.name.split(" ")[0]}</span><Icon name="more" /></button>
              {accountMenuOpen && <div className="account-menu">
                <div className="account-menu-heading"><strong>{user.name}</strong><span>{user.isPreview ? "Preview account" : user.email}</span></div>
                {(["reports", "semesters", "settings"] as ViewKey[]).map((key) => <button key={key} onClick={() => { setView(key); setAccountMenuOpen(false); }}><Icon name={viewMeta[key].icon} />{viewMeta[key].title}</button>)}
                <button className="account-signout" onClick={handleSignOut}><Icon name="logout" />Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        <main className="app-content">
          <div className={`page-heading ${view === "overview" ? "page-heading-overview" : ""}`}>
            <div className="page-heading-copy">
              {view === "overview" && <div className="date-kicker">{todayLabel}</div>}
              <h1>{view === "overview" ? `${greet}, ${user.name.split(" ")[0]}` : meta.title}</h1>
              <p>{view === "overview" ? meta.subtitle : view === "subjects" ? `Your overall floor is ${data.settings.overallTarget}%. Subject floors start at ${data.settings.defaultSubjectTarget}%.` : meta.subtitle}</p>
            </div>
            <div className={`heading-actions ${view === "overview" ? "overview-heading-actions" : ""}`}>
              {view === "subjects" && <button className="button button-primary" onClick={() => setDialog({ kind: "subject" })}><Icon name="plus" />Add subject</button>}
              {view === "overview" && <>
                <button className="button button-quiet" onClick={() => openWholeDayAttendance()} aria-label="Mark whole day" title="Mark whole day"><Icon name="calendar"/><span>Mark whole day</span></button>
                <button className="button button-primary" onClick={() => openAttendance()} aria-label="Mark single subject" title="Mark single subject"><Icon name="plus"/><span>Mark single subject</span></button>
              </>}
              {(view === "attendance" || view === "calendar") && <button className="button button-primary" onClick={() => openAttendance()}><Icon name="plus" /><span>Log attendance</span></button>}
              {view === "reports" && <button className="button button-quiet" onClick={() => exportCsv(selectedReportSubjectId)}><Icon name="download" />Export CSV</button>}
              {view === "semesters" && <button className="button button-primary" onClick={() => setDialog({ kind: "semester" })}><Icon name="plus" />New semester</button>}
            </div>
          </div>

          {view === "overview" && <OverviewView todayLabel={todayLabel} subjects={currentSubjects} records={activeRecords} totals={totals} overallTarget={data.settings.overallTarget} missingCount={missingSubjects.length} onView={setView} />}
          {view === "subjects" && <SubjectsView subjects={semesterSubjects} records={semesterRecords} onAdd={() => setDialog({ kind: "subject" })} onEdit={(subject) => setDialog({ kind: "subject", subject })} onLog={openAttendance} onQuickLog={quickLog} onArchive={(subject) => setDialog({ kind: "archive-subject", subject })} showArchived={showArchived} onToggleArchived={() => setShowArchived((value) => !value)} />}
          {view === "attendance" && <AttendanceView subjects={semesterSubjects} records={semesterRecords} onEdit={(record) => setDialog({ kind: "attendance", record })} onDelete={(record) => setDialog({ kind: "delete-record", record })} onAdd={() => openAttendance()} onWholeDay={() => openWholeDayAttendance()} />}
          {view === "calendar" && <CalendarView subjects={semesterSubjects} records={semesterRecords} onAdd={(date) => openAttendance(undefined, date)} onWholeDay={openWholeDayAttendance} />}
          {view === "timetable" && activeSemester && <TimetableView semesterId={activeSemester.id} semesterName={activeSemester.name} academicProfile={user.academicProfile} semesterAcademicProfile={activeSemester.academicProfile} subjects={semesterSubjects} timetable={data.timetable} onSave={saveTimetable} onAddSubject={() => setDialog({ kind: "subject" })} />}
          {view === "planner" && <PlannerView subjects={currentSubjects} records={activeRecords} overallTarget={data.settings.overallTarget} />}
          {view === "reports" && <ReportsView subjects={currentSubjects} records={activeRecords} totals={totals} target={data.settings.overallTarget} subjectId={selectedReportSubjectId} onSubjectChange={setReportSubjectId} onExport={() => exportCsv(selectedReportSubjectId)} />}
          {view === "semesters" && <SemestersView semesters={data.semesters} activeSemesterId={activeSemester?.id ?? ""} onActivate={setActiveSemester} onArchive={(semester) => setDialog({ kind: "archive-semester", semester })} onCreate={() => setDialog({ kind: "semester" })} />}
          {view === "settings" && <SettingsView settings={data.settings} preview={user.isPreview} onSave={saveSettings} onDeleteAccount={() => setDialog({ kind: "delete-account" })} />}
        </main>
      </div>

      {dialog?.kind === "attendance" && <AttendanceModal subjects={semesterSubjects} initialRecord={dialog.record} initialSubjectId={dialog.subjectId} initialDate={dialog.date} onClose={() => setDialog(null)} onSave={saveAttendance} />}
      {dialog?.kind === "whole-day-attendance" && activeSemester && <WholeDayAttendanceModal subjects={currentSubjects} records={semesterRecords} timetable={data.timetable} semesterId={activeSemester.id} initialDate={dialog.date} onClose={() => setDialog(null)} onSave={saveWholeDayAttendance} />}
      {dialog?.kind === "subject" && activeSemester && <SubjectModal subject={dialog.subject} semesterId={activeSemester.id} defaultTarget={data.settings.defaultSubjectTarget} onClose={() => setDialog(null)} onSave={saveSubject} />}
      {dialog?.kind === "semester" && <SemesterModal defaultAcademicProfile={activeSemester?.academicProfile ?? user?.academicProfile} onClose={() => setDialog(null)} onSave={saveSemester} />}
      {dialog?.kind === "delete-record" && <ConfirmModal title="Remove this class record?" copy={`${formatDate(dialog.record.date, { weekday: "long", day: "numeric", month: "long" })} — this record will be removed from the semester totals.`} action="Remove record" onClose={() => setDialog(null)} onConfirm={() => deleteRecord(dialog.record)} />}
      {dialog?.kind === "archive-subject" && <ConfirmModal title={dialog.subject.archived ? "Restore this subject?" : "Archive this subject?"} copy={dialog.subject.archived ? "The subject will appear in your active subject list again." : "The subject’s history will stay saved, but it will leave your active dashboard totals."} action={dialog.subject.archived ? "Restore subject" : "Archive subject"} onClose={() => setDialog(null)} onConfirm={() => toggleArchive(dialog.subject)} />}
      {dialog?.kind === "archive-semester" && <ConfirmModal title={dialog.semester.archived ? "Restore this semester?" : "Archive this semester?"} copy={dialog.semester.archived ? "This semester and its saved subjects, timetable, and attendance history will be available again." : "This semester will leave your active workspace. Its subjects, timetable, and attendance history will stay saved."} action={dialog.semester.archived ? "Restore semester" : "Archive semester"} onClose={() => setDialog(null)} onConfirm={() => toggleArchiveSemester(dialog.semester)} />}
      {dialog?.kind === "delete-account" && !user.isPreview && <DeleteAccountModal onClose={() => setDialog(null)} onConfirm={handleAccountDeletion} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function useModalFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog = dialog;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    const focusable = getFocusable();
    (focusable[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandler.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) { event.preventDefault(); activeDialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    activeDialog.addEventListener("keydown", onKeyDown);
    return () => {
      activeDialog.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return dialogRef;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function StatusPill({ health, text }: { health: ReturnType<typeof getHealth>; text?: string }) {
  const label = text ?? ({ safe: "On track", watch: "Near target", critical: "Below target", empty: "No data" }[health]);
  return <span className={`status-pill ${health}`}><span className="status-dot" />{label}</span>;
}

function AttendanceWarning({ label }: { label: string }) {
  return <span className="attendance-warning-icon" role="img" aria-label={label} title={label}><Icon name="alert" /></span>;
}

function OverviewView({ todayLabel, subjects, records, totals, overallTarget, missingCount, onView }: {
  todayLabel: string; subjects: Subject[]; records: AttendanceRecord[];
  totals: ReturnType<typeof getTotals>; overallTarget: number; missingCount: number;
  onView: (view: ViewKey) => void;
}) {
  const health = getHealth(totals.percentage, overallTarget);
  const overallBelowMinimum = totals.percentage !== null && totals.percentage < overallTarget;
  const labelDate = todayLabel.split(",").slice(1).join(",").trim();
  return (
    <>
      <section className="metric-grid" aria-label="Semester attendance summary">
        <div className="overall-card">
          <div className="overall-card-copy">
            <div className="overline">OVERALL ATTENDANCE</div>
            <div className="overall-number"><span className="attendance-percentage">{formatPercentage(totals.percentage)}{totals.percentage !== null && totals.percentage < overallTarget && <AttendanceWarning label={`Overall attendance is below the ${overallTarget}% minimum`} />}</span><small>{totals.percentage === null ? "No data yet" : "this semester"}</small></div>
            <div className="overall-card-meta"><span>{totals.attended} of {totals.conducted} periods attended</span></div>
          </div>
          <div className="target-caption"><b>{overallTarget}%</b>minimum overall target</div>
        </div>
        <MetricCard icon="calendar" label="Classes conducted" value={String(totals.conducted)} foot={`${totals.attended} attended`} />
        <MetricCard icon="book" label="Subjects" value={String(subjects.length)} foot={subjects.length ? "In this semester" : "Add your first subject"} />
        <MetricCard icon="target" label="Need attention" value={String(missingCount)} foot={missingCount ? "Below subject target" : "No subjects below target"} urgent={missingCount > 0} />
      </section>

      {(overallBelowMinimum || missingCount > 0) && <div className="attendance-low-notice" role="status">
        <Icon name="alert" />
        <div><strong>Attendance is low</strong><p>{[
          overallBelowMinimum ? `Overall attendance is ${formatPercentage(totals.percentage)}, below the ${overallTarget}% minimum.` : "",
          missingCount > 0 ? `${missingCount} ${missingCount === 1 ? "subject is" : "subjects are"} below the minimum attendance.` : "",
          "Attend upcoming classes to improve your standing.",
        ].filter(Boolean).join(" ")}</p></div>
      </div>}

      <section className="card overview-subjects" aria-label="Subject attendance summary">
        <div className="card-heading"><div><h2>Subject attendance</h2><p>Attendance percentage and class totals for each subject</p></div><button className="text-link" onClick={() => onView("subjects")}>All subjects <Icon name="arrow" /></button></div>
        {subjects.length ? <div className="overview-subject-grid">{subjects.map((subject) => {
          const subjectTotals = getSubjectTotals(records, subject.id);
          const belowMinimum = subjectTotals.percentage !== null && subjectTotals.percentage < subject.requiredAttendance;
          return <article className="overview-subject-card" key={subject.id}>
            <div className="overview-subject-name"><h3>{subject.name}</h3>{subject.code && <p>{subject.code}</p>}</div>
            <div className="overview-subject-percentage attendance-percentage">{formatPercentage(subjectTotals.percentage)}{belowMinimum && <AttendanceWarning label={`${subject.name} attendance is below the ${subject.requiredAttendance}% minimum`} />}</div>
            <p className="overview-subject-target">{subjectTotals.percentage === null ? "No classes recorded" : `${subject.requiredAttendance}% minimum attendance`}</p>
            <dl className="overview-subject-counts"><div><dt>Classes attended</dt><dd>{subjectTotals.attended}</dd></div><div><dt>Classes conducted</dt><dd>{subjectTotals.conducted}</dd></div></dl>
          </article>;
        })}</div> : <EmptyState title="No subjects yet" copy="Add a subject to start seeing your attendance here." action={<button className="text-link" onClick={() => onView("subjects")}>Add a subject <Icon name="arrow" /></button>} />}
      </section>
      <p className="overview-footnote"><Icon name="spark" />{health === "critical" ? `Your overall attendance is under ${overallTarget}%. Each attended class helps bring it back up.` : health === "watch" ? `You’re close to the ${overallTarget}% overall floor. Keep an eye on upcoming absences.` : health === "safe" ? `You’re above the ${overallTarget}% overall floor. Keep your rhythm steady.` : `Start by adding your subjects and recording today’s classes.`}<span className="overview-footnote-date">{labelDate}</span></p>
    </>
  );
}

function MetricCard({ icon, label, value, foot, urgent = false }: { icon: IconName; label: string; value: string; foot: string; urgent?: boolean }) {
  return <div className="card metric-card"><div className="metric-label"><span className="metric-icon"><Icon name={icon}/></span>{label}</div><div className="metric-value">{value}</div><div className="metric-foot"><strong className={urgent ? "red-text" : ""}>{foot}</strong></div></div>;
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><div><strong>{title}</strong><p>{copy}</p>{action && <div style={{ marginTop: 12 }}>{action}</div>}</div></div>;
}

function SubjectsView({
  subjects, records, onAdd, onEdit, onLog, onQuickLog, onArchive, showArchived, onToggleArchived,
}: {
  subjects: Subject[]; records: AttendanceRecord[]; onAdd: () => void; onEdit: (subject: Subject) => void;
  onLog: (subjectId?: string) => void; onQuickLog: (subjectId: string, status: "present" | "absent") => void;
  onArchive: (subject: Subject) => void; showArchived: boolean; onToggleArchived: () => void;
}) {
  const visible = subjects.filter((subject) => showArchived ? subject.archived : !subject.archived);
  return <>
    <div className="section-title-row subject-section-heading">
      <div><h2>{showArchived ? "Archived subjects" : "Current subjects"}</h2><p>{subjects.filter((subject) => !subject.archived).length} active · history stays attached to each subject</p></div>
      <button className="text-link" onClick={onToggleArchived}><Icon name="archive" />{showArchived ? "Show current" : "Show archived"}</button>
    </div>
    {visible.length ? <div className="subject-grid">{visible.map((subject) => {
      const summary = getSubjectTotals(records, subject.id);
      const health = getHealth(summary.percentage, subject.requiredAttendance);
      return <article className="card subject-card" key={subject.id}>
        <div className="subject-card-head">
          <div className="subject-identity"><span className="subject-color" style={{ backgroundColor: subject.color }}/><div className="subject-name"><h3>{subject.name}</h3><p>{subject.code || "No subject code"}</p></div></div>
          <div className="subject-card-actions">
            <button className="icon-button" aria-label={`Edit ${subject.name}`} onClick={() => onEdit(subject)}><Icon name="edit" /></button>
            <button className="icon-button" aria-label={subject.archived ? `Restore ${subject.name}` : `Archive ${subject.name}`} onClick={() => onArchive(subject)}><Icon name={subject.archived ? "refresh" : "archive"} /></button>
          </div>
        </div>
        <div className="subject-progress-row"><span className="subject-percentage">{formatPercentage(summary.percentage)}</span><span className="subject-attended">{summary.attended} of {summary.conducted} periods attended</span></div>
        <div className="progress-track" aria-label={`${formatPercentage(summary.percentage)} attendance`}><div className={`progress-fill ${health}`} style={{ width: `${Math.min(100, summary.percentage ?? 0)}%` }}/></div>
        <div className="subject-footer"><span className="subject-footer-copy">Required <strong>{subject.requiredAttendance}%</strong></span><StatusPill health={health}/></div>
        {!subject.archived && <div className="subject-actions-row"><button className="button button-quiet quick-present" onClick={() => onQuickLog(subject.id, "present")}><Icon name="check"/>Present</button><button className="button button-quiet quick-absent" onClick={() => onQuickLog(subject.id, "absent")}><Icon name="close"/>Absent</button><button className="button button-quiet" onClick={() => onLog(subject.id)}><Icon name="plus"/>More</button></div>}
      </article>;
    })}</div> : <div className="card"><EmptyState title={showArchived ? "No archived subjects" : "Add your first subject"} copy={showArchived ? "Subjects you archive will stay here with their attendance history." : "Add the classes you’re taking. Each subject starts with a 75% required attendance target."} action={!showArchived ? <button className="button button-primary" onClick={onAdd}><Icon name="plus"/>Add subject</button> : undefined}/></div>}
  </>;
}

function AttendanceView({
  subjects, records, onEdit, onDelete, onAdd, onWholeDay,
}: {
  subjects: Subject[]; records: AttendanceRecord[]; onEdit: (record: AttendanceRecord) => void;
  onDelete: (record: AttendanceRecord) => void; onAdd: () => void; onWholeDay: () => void;
}) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const filtered = [...records].filter((record) => {
    const status = getRecordStatus(record);
    return (subjectFilter === "all" || record.subjectId === subjectFilter) &&
      (statusFilter === "all" || status === statusFilter) &&
      (!fromDate || record.date >= fromDate) && (!toDate || record.date <= toDate);
  }).sort((a, b) => b.date.localeCompare(a.date));
  const grouped = new Map<string, AttendanceRecord[]>();
  filtered.forEach((record) => grouped.set(record.date, [...(grouped.get(record.date) ?? []), record]));
  return <>
    <div className="history-summary-row"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? "class record" : "class records"}</span><div className="history-summary-actions"><span>Present, absent, or partial attendance by date</span><button className="button button-primary" onClick={onWholeDay}><Icon name="calendar"/>Mark whole day</button></div></div>
    <div className="filter-bar">
      <select className="filter-select" aria-label="Filter by subject" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
      <select className="filter-select" aria-label="Filter by attendance status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="partial">Partial</option></select>
      <label className="date-filter-label">From <input className="filter-input" type="date" aria-label="From date" value={fromDate} onChange={(event) => setFromDate(event.target.value)}/></label>
      <label className="date-filter-label">To <input className="filter-input" type="date" aria-label="To date" value={toDate} onChange={(event) => setToDate(event.target.value)}/></label>
    </div>
    {grouped.size ? [...grouped.entries()].map(([date, dayRecords]) => <section className="card history-day" key={date}>
      <div className="history-day-heading"><strong>{formatDay(date)}, {formatDate(date, { day: "numeric", month: "long", year: "numeric" })}</strong><span>{dayRecords.length} {dayRecords.length === 1 ? "class" : "classes"} · {dayRecords.reduce((sum, record) => sum + record.periods, 0)} periods</span></div>
      {dayRecords.map((record) => {
        const subject = subjectById.get(record.subjectId);
        const status = getRecordStatus(record);
        const health = status === "present" ? "safe" : status === "absent" ? "critical" : "watch";
        return <div className="history-row" key={record.id}>
          <div className="history-subject"><span className="subject-color" style={{ backgroundColor: subject?.color ?? "#a8b8b1" }}/><strong>{subject?.name ?? "Archived subject"}</strong></div>
          <span className="history-detail">{record.attended} of {record.periods} periods attended{record.note ? ` · ${record.note}` : ""}</span>
          <StatusPill health={health} text={status === "partial" ? "Partial" : status === "present" ? "Present" : "Absent"}/>
          <div className="history-actions"><button className="icon-button" aria-label={`Edit ${subject?.name ?? "class"} record`} onClick={() => onEdit(record)}><Icon name="edit"/></button><button className="icon-button" aria-label="Remove class record" onClick={() => onDelete(record)}><Icon name="trash"/></button></div>
        </div>;
      })}
    </section>) : <div className="card"><EmptyState title={records.length ? "No matching classes" : "No attendance recorded yet"} copy={records.length ? "Change the filters or choose a wider date range." : "Log a class to start building your date-wise history."} action={!records.length ? <button className="button button-primary" onClick={onAdd}><Icon name="plus"/>Log a class</button> : undefined}/></div>}
  </>;
}

function CalendarView({ subjects, records, onAdd, onWholeDay }: { subjects: Subject[]; records: AttendanceRecord[]; onAdd: (date?: string) => void; onWholeDay: (date?: string) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1, 12).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cellsCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellsCount }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    const date = new Date(month.getFullYear(), month.getMonth(), dayNumber, 12);
    return { date, dateString: dateKey(date), inMonth: date.getMonth() === month.getMonth() };
  });
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
  const selectedRecords = records.filter((record) => record.date === selectedDate);
  const recordsByDate = new Map<string, AttendanceRecord[]>();
  records.forEach((record) => recordsByDate.set(record.date, [...(recordsByDate.get(record.date) ?? []), record]));

  return <div className="calendar-layout">
    <section className="card calendar-card">
      <p className="calendar-reference-note">This calendar is for reference.</p>
      <div className="calendar-controls"><strong>{monthLabel}</strong><div className="calendar-arrow-row"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}><Icon name="chevron-left"/></button><button className="icon-button" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}><Icon name="chevron-right"/></button></div></div>
      <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map(({ date, dateString, inMonth }) => {
        const dayRecords = recordsByDate.get(dateString) ?? [];
        const today = dateString === dateKey(new Date());
        return <button className={`calendar-day ${inMonth ? "" : "muted"} ${today ? "today" : ""} ${selectedDate === dateString ? "selected" : ""}`} key={dateString} onClick={() => setSelectedDate(dateString)} aria-label={`${formatDay(dateString)}, ${formatDate(dateString)}${dayRecords.length ? `, ${dayRecords.length} classes` : ""}`} aria-pressed={selectedDate === dateString}>
          <span className="calendar-day-number">{date.getDate()}</span>
          <span className="calendar-dots">{dayRecords.slice(0, 4).map((record) => <span className={`calendar-dot ${getRecordStatus(record)}`} key={record.id}/>)}</span>
        </button>;
      })}</div>
    </section>
    <aside className="card calendar-side-card">
      <h2>{formatDay(selectedDate)}, {formatDate(selectedDate, { day: "numeric", month: "long" })}</h2>
      <p>{selectedRecords.length ? `${selectedRecords.length} ${selectedRecords.length === 1 ? "class" : "classes"} recorded` : "No classes recorded on this day"}</p>
      {selectedRecords.map((record) => {
        const subject = subjectById.get(record.subjectId);
        const status = getRecordStatus(record);
        return <div className="calendar-record" key={record.id}><span className="subject-color" style={{ backgroundColor: subject?.color ?? "#a8b8b1" }}/><div><strong>{subject?.name ?? "Archived subject"}</strong><span>{record.attended} of {record.periods} periods attended</span></div><StatusPill health={status === "present" ? "safe" : status === "absent" ? "critical" : "watch"} text={status === "partial" ? "Partial" : status === "present" ? "Present" : "Absent"}/></div>;
      })}
      <button className="button button-quiet calendar-add" onClick={() => onAdd(selectedDate)}><Icon name="plus"/>Log class on this day</button>
      <button className="button button-primary calendar-add-day" onClick={() => onWholeDay(selectedDate)}><Icon name="calendar"/>Mark whole day</button>
    </aside>
  </div>;
}

const timetableDays = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
];

type TimetableBreak = { afterHour: number; label: "Lunch" | "Break" };
type TimetableColumn = { kind: "hour"; hour: number } | ({ kind: "break" } & TimetableBreak);

function semesterBreaks(semesterName: string): TimetableBreak[] {
  const semesterMatch = semesterName.match(/(?:semester|sem)[^\d]*(\d+)/i) ?? semesterName.match(/(\d+)/);
  const semesterNumber = Number(semesterMatch?.[1]);
  if ([1, 2, 5, 6].includes(semesterNumber)) return [{ afterHour: 3, label: "Lunch" }, { afterHour: 5, label: "Break" }];
  if ([3, 4, 7, 8].includes(semesterNumber)) return [{ afterHour: 2, label: "Break" }, { afterHour: 4, label: "Lunch" }];
  return [];
}

function semesterNumberFromName(semesterName: string, fallback: number) {
  const match = semesterName.match(/(?:semester|sem)[^\d]*(\d+)/i) ?? semesterName.match(/(\d+)/);
  const semesterNumber = Number(match?.[1]);
  return Number.isInteger(semesterNumber) && semesterNumber >= 1 && semesterNumber <= 8 ? semesterNumber : fallback;
}

function timetableKey(weekday: number, hour: number) { return `${weekday}-${hour}`; }

function timetableDraft(entries: TimetableEntry[], semesterId: string) {
  return Object.fromEntries(entries.filter((entry) => entry.semesterId === semesterId).map((entry) => [timetableKey(entry.weekday, entry.hour), entry.subjectId]));
}

function TimetableView({
  semesterId, semesterName, academicProfile, semesterAcademicProfile, subjects, timetable, onSave, onAddSubject,
}: {
  semesterId: string; semesterName: string; academicProfile?: StudentAcademicProfile | null; semesterAcademicProfile?: StudentAcademicProfile; subjects: Subject[]; timetable: TimetableEntry[];
  onSave: (entries: TimetableEntry[]) => void; onAddSubject: () => void;
}) {
  const activeEntries = timetable.filter((entry) => entry.semesterId === semesterId);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(() => ({ [semesterId]: timetableDraft(timetable, semesterId) }));
  const [editingSemesters, setEditingSemesters] = useState<Record<string, boolean>>({});
  const [collegeRefresh, setCollegeRefresh] = useState<{ id: number; profileKey: string } | null>(null);
  const refreshSequence = useRef(0);
  const lastHandledRefresh = useRef(0);
  const [collegePdf, setCollegePdf] = useState<{ status: "loading" | "ready" | "unavailable"; images: string[]; message: string; sourceUrl: string | null }>({ status: "loading", images: [], message: "Fetching your matching college timetable…", sourceUrl: null });
  const draft = drafts[semesterId] ?? timetableDraft(timetable, semesterId);
  const editing = editingSemesters[semesterId] ?? activeEntries.length === 0;
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const activeSubjects = subjects.filter((subject) => !subject.archived);
  const timetableProfile = semesterAcademicProfile ?? academicProfile;
  const breaks = semesterAcademicProfile ? semesterBreaks(`Semester ${semesterAcademicProfile.semester}`) : semesterBreaks(semesterName);
  const collegeSemester = semesterAcademicProfile?.semester ?? (academicProfile ? semesterNumberFromName(semesterName, academicProfile.semester) : 0);
  const collegeStudyYear = semesterAcademicProfile?.studyYear ?? (collegeSemester ? Math.ceil(collegeSemester / 2) : academicProfile?.studyYear ?? 0);
  const savedSourceUrl = timetableProfile && collegeSemester === timetableProfile.semester ? timetableProfile.collegeTimetableUrl : null;
  const profileKey = timetableProfile ? [timetableProfile.departmentCode, timetableProfile.academicYearCode, collegeStudyYear, collegeSemester, timetableProfile.sectionCode, savedSourceUrl].join("|") : "";
  const columns: TimetableColumn[] = [];
  for (let hour = 1; hour <= 7; hour += 1) {
    columns.push({ kind: "hour", hour });
    breaks.filter((pause) => pause.afterHour === hour).forEach((pause) => columns.push({ kind: "break", ...pause }));
  }

  useEffect(() => {
    if (!timetableProfile) {
      setCollegePdf({ status: "unavailable", images: [], message: "No matching college timetable was found. Your editable weekday timetable is still available below.", sourceUrl: null });
      return;
    }

    const controller = new AbortController();
    let imageUrls: string[] = [];
    const params = new URLSearchParams({
      mode: "pdf",
      department: timetableProfile.departmentCode,
      academicYear: timetableProfile.academicYearCode,
      studyYear: String(collegeStudyYear),
      semester: String(collegeSemester),
      section: timetableProfile.sectionCode,
      attempt: String(collegeRefresh?.id ?? 0),
    });

    const cacheKey = `svce:v1:${profileKey}`;
    const forceRefresh = collegeRefresh?.profileKey === profileKey && collegeRefresh.id > lastHandledRefresh.current;
    if (forceRefresh && collegeRefresh) lastHandledRefresh.current = collegeRefresh.id;
    setCollegePdf({
      status: "loading",
      images: [],
      message: forceRefresh ? "Refreshing the official college timetable…" : "Loading your saved college timetable…",
      sourceUrl: null,
    });

    async function loadCollegePdf() {
      if (!forceRefresh) {
        const cachedPdf = await readCachedCollegeTimetable(cacheKey);
        if (cachedPdf) return cachedPdf;
      }

      if (!controller.signal.aborted) {
        setCollegePdf({ status: "loading", images: [], message: "Fetching your matching college timetable…", sourceUrl: null });
      }
      const response = await fetch(`/api/svce-timetable?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) {
        const result = response.headers.get("content-type")?.toLowerCase().includes("application/json")
          ? await response.json() as { message?: string }
          : null;
        throw new Error(typeof result?.message === "string" && result.message
          ? result.message
          : "The matching college timetable could not be fetched. Your editable weekday timetable is still available below.");
      }

      const pdfBytes = await response.arrayBuffer();
      const sourceUrl = response.headers.get("X-College-Timetable-Url");
      await writeCachedCollegeTimetable(cacheKey, pdfBytes, sourceUrl);
      return { bytes: pdfBytes, sourceUrl };
    }

    loadCollegePdf()
      .then(async (cachedPdf) => ({
        images: controller.signal.aborted ? [] : await renderTimetablePdfPages(cachedPdf.bytes),
        sourceUrl: cachedPdf.sourceUrl,
      }))
      .then(({ images, sourceUrl }) => {
        if (controller.signal.aborted) {
          images.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        imageUrls = images;
        setCollegePdf({ status: "ready", images, message: `The original timetable is shown as ${images.length} full PDF page${images.length === 1 ? "" : "s"}, without cropping. Fill the Attendly weekday timetable below separately for whole-day attendance marking.`, sourceUrl });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCollegePdf({
          status: "unavailable",
          images: [],
          message: error instanceof Error && error.message.includes("toHex is not a function")
            ? "The college timetable could not be previewed. Please refresh to try again. Your editable weekday timetable is still available below."
            : error instanceof Error ? error.message : "The college timetable could not be previewed. Your editable weekday timetable is still available below.",
          sourceUrl: null,
        });
      });

    return () => {
      controller.abort();
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [timetableProfile, profileKey, collegeRefresh]);

  function setSlot(weekday: number, hour: number, subjectId: string, span = 1) {
    setDrafts((current) => ({
      ...current,
      [semesterId]: {
        ...(current[semesterId] ?? draft),
        ...Object.fromEntries(Array.from({ length: span }, (_, index) => [timetableKey(weekday, hour + index), subjectId])),
      },
    }));
  }
  function beginEditing() {
    setDrafts((current) => ({ ...current, [semesterId]: timetableDraft(timetable, semesterId) }));
    setEditingSemesters((current) => ({ ...current, [semesterId]: true }));
  }
  function cancelEditing() {
    setDrafts((current) => ({ ...current, [semesterId]: timetableDraft(timetable, semesterId) }));
    setEditingSemesters((current) => ({ ...current, [semesterId]: false }));
  }
  function save() {
    const entries: TimetableEntry[] = [];
    for (const day of timetableDays) {
      for (let hour = 1; hour <= 7; hour += 1) {
        const subjectId = draft[timetableKey(day.weekday, hour)];
        if (subjectId && subjectById.has(subjectId)) entries.push({ semesterId, weekday: day.weekday, hour, subjectId });
      }
    }
    onSave(entries);
    setEditingSemesters((current) => ({ ...current, [semesterId]: false }));
  }

  function renderDaySlots(day: typeof timetableDays[number]): ReactNode[] {
    const cells: ReactNode[] = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (column.kind === "break") {
        cells.push(<td className={`timetable-break-cell ${column.label.toLowerCase()}`} key={`${column.kind}-${index}`}><strong>{column.label}</strong></td>);
        continue;
      }

      const hour = column.hour;
      const subjectId = draft[timetableKey(day.weekday, hour)] ?? "";
      let span = 1;
      if (!editing && subjectId) {
        while (index + span < columns.length) {
          const nextColumn = columns[index + span];
          if (nextColumn.kind !== "hour" || nextColumn.hour !== hour + span) break;
          if ((draft[timetableKey(day.weekday, nextColumn.hour)] ?? "") !== subjectId) break;
          span += 1;
        }
      }
      const subject = subjectById.get(subjectId);
      const hourDescription = span === 1 ? `hour ${hour}` : `hours ${hour} to ${hour + span - 1}`;
      cells.push(<td colSpan={span} key={`${column.kind}-${hour}`}>
        {editing ? <label className="timetable-slot-editor"><span className="sr-only">{day.label}, hour {hour}</span><select aria-label={`${day.label}, hour ${hour}`} value={subjectId} disabled={!activeSubjects.length} onChange={(event) => setSlot(day.weekday, hour, event.target.value, 1)}>
          <option value="">Free hour</option>{subjects.map((option) => <option value={option.id} key={option.id} disabled={option.archived}>{option.name}{option.archived ? " · archived" : ""}</option>)}
        </select></label> : subject ? <div className={`timetable-subject-chip ${subject.archived ? "archived" : ""}`} style={{ borderLeftColor: subject.color }}><strong>{subject.name}</strong>{subject.code && <small>{subject.code}</small>}</div> : <div className="timetable-free-slot">Free</div>}
      </td>);
      index += span - 1;
    }
    return cells;
  }

  return <div className="timetable-view-stack">
    {timetableProfile && <section className="card college-timetable-card">
      <div className="college-timetable-heading">
        <div><span className="college-timetable-eyebrow">OFFICIAL SVCE TIMETABLE</span><h2>College timetable · original PDF</h2><p>{timetableProfile.department} · {getStudyYearLabel(collegeStudyYear)} · Semester {collegeSemester} · {timetableProfile.section} · {timetableProfile.academicYear}</p></div>
        <div className="college-timetable-actions">
          <button className="button button-quiet" onClick={() => {
            const id = refreshSequence.current + 1;
            refreshSequence.current = id;
            setCollegeRefresh({ id, profileKey });
          }} disabled={collegePdf.status === "loading"} aria-label="Refresh official college timetable"><Icon name="refresh"/>{collegePdf.status === "loading" && collegePdf.message.includes("Refreshing") ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>
      {collegePdf.status === "ready" ? <>
        <div className="college-timetable-pages" role="group" aria-label={`Complete official timetable PDF pages for ${timetableProfile.department}, semester ${collegeSemester}`}>
          {collegePdf.images.map((image, index) => <figure className="college-timetable-page" key={`${profileKey}-page-${index + 1}`}>
            <img src={image} alt={`Official SVCE timetable, page ${index + 1} of ${collegePdf.images.length}. Full page shown without cropping.`} loading={index === 0 ? "eager" : "lazy"}/>
            <figcaption>Page {index + 1} of {collegePdf.images.length}</figcaption>
          </figure>)}
        </div>
        <p className="college-timetable-note"><Icon name="check-circle"/>{collegePdf.message}</p>
      </> : <div className={`college-timetable-message ${collegePdf.status}`} role="status">
        {collegePdf.status === "loading" && <Icon name="refresh"/>}
        {collegePdf.status === "unavailable" && <Icon name="alert"/>}
        <span>{collegePdf.message}</span>
      </div>}
    </section>}
    <section className="card timetable-card">
    <div className="timetable-heading">
      <div><h2>Weekly class timetable</h2><p>{breaks.length ? `${semesterName}: ${breaks[0].label} after Hour ${breaks[0].afterHour} and ${breaks[1].label.toLowerCase()} after Hour ${breaks[1].afterHour}.` : `${semesterName}: no default break structure is set.`} Seven hours a day, Monday to Friday.</p></div>
      <div className="timetable-actions">
        {editing ? <>
          <button className="button button-quiet" onClick={cancelEditing}>Cancel</button>
          <button className="button button-primary" onClick={save}><Icon name="check"/>Save timetable</button>
        </> : <button className="button button-quiet" onClick={beginEditing}><Icon name="edit"/>Edit timetable</button>}
      </div>
    </div>
    <div className="timetable-manual-callout" role="note"><Icon name="calendar"/><div><strong>{activeEntries.length ? "Keep your Attendly timetable up to date" : "Fill this timetable manually"}</strong><p>The college PDF is only a reference and does not fill this schedule automatically. Whole-day attendance uses the subjects saved in this weekly timetable.</p></div></div>
    {!activeSubjects.length && <div className="timetable-empty-subjects"><span>Add subjects before filling out your weekly schedule.</span><button className="text-link" onClick={onAddSubject}><Icon name="plus"/>Add a subject</button></div>}
    <div className="timetable-scroll">
      <table className="timetable-table">
        <colgroup><col className="timetable-day-column"/>{columns.map((column, index) => <col className={column.kind === "break" ? "timetable-break-column" : "timetable-hour-slot-column"} key={`${column.kind}-${index}`}/>)}</colgroup>
        <thead><tr><th className="timetable-day-heading" scope="col">Day</th>{columns.map((column, index) => <th className={column.kind === "break" ? `timetable-break-heading ${column.label.toLowerCase()}` : "timetable-hour-heading"} scope="col" key={`${column.kind}-${index}`}>{column.kind === "hour" ? <>Hour <span>{column.hour}</span></> : column.label}</th>)}</tr></thead>
        <tbody>{timetableDays.map((day) => <tr key={day.weekday}>
          <th className="timetable-day-label" scope="row">{day.label}</th>
          {renderDaySlots(day)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="timetable-footnote"><Icon name="calendar"/><span>Whole-day marking uses these saved weekday slots. The college timetable PDF, when available, is a separate reference.</span></div>
    </section>
  </div>;
}

type PlannerScope = "overall" | "subject";
type PlannerForecast = { upcoming: string; attending: string };
const emptyPlannerForecast: PlannerForecast = { upcoming: "", attending: "" };

function parsePlannerCount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(60, Math.trunc(parsed))) : null;
}

function normalizePlannerCount(value: string, maximum = 60): string {
  if (value.trim() === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.max(0, Math.min(maximum, Math.trunc(parsed)))) : "";
}

function PlannerView({ subjects, records, overallTarget }: {
  subjects: Subject[]; records: AttendanceRecord[]; overallTarget: number;
}) {
  const [scope, setScope] = useState<PlannerScope>("overall");
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id ?? "");
  const [overallForecast, setOverallForecast] = useState<PlannerForecast>(emptyPlannerForecast);
  const [subjectForecasts, setSubjectForecasts] = useState<Record<string, PlannerForecast>>({});
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0];
  const activeForecast = scope === "overall"
    ? overallForecast
    : selectedSubject ? subjectForecasts[selectedSubject.id] ?? emptyPlannerForecast : emptyPlannerForecast;
  const futureClasses = parsePlannerCount(activeForecast.upcoming);
  const plannedAttendances = parsePlannerCount(activeForecast.attending);
  const overallCurrent = getTotals(records);
  const effectiveOverallTarget = Math.max(80, overallTarget);
  const current = scope === "overall"
    ? overallCurrent
    : selectedSubject ? getSubjectTotals(records, selectedSubject.id) : getTotals([]);
  const target = scope === "overall" ? Math.max(80, overallTarget) : Math.max(75, selectedSubject?.requiredAttendance ?? 75);
  const targetName = scope === "overall" ? `${target}% overall` : `${target}% for ${selectedSubject?.name ?? "this subject"}`;
  const attendAllScenario = futureClasses === null ? null : afterAttending(current, futureClasses);
  const missAllScenario = futureClasses === null ? null : afterMissing(current, futureClasses);
  const neededInWindow = futureClasses === null ? null : classesToAttendWithinUpcoming(current, target, futureClasses);
  const consecutiveNeeded = classesNeeded(current, target);
  const plannedProjection = futureClasses !== null && plannedAttendances !== null && current.conducted + futureClasses > 0
    ? ((current.attended + Math.min(plannedAttendances, futureClasses)) / (current.conducted + futureClasses)) * 100
    : null;
  const overallPlanned = futureClasses !== null && plannedAttendances !== null && overallCurrent.conducted + futureClasses > 0
    ? ((overallCurrent.attended + Math.min(plannedAttendances, futureClasses)) / (overallCurrent.conducted + futureClasses)) * 100
    : null;

  function updateForecast(update: Partial<PlannerForecast>) {
    if (scope === "overall") {
      setOverallForecast((forecast) => ({ ...forecast, ...update }));
      return;
    }
    if (!selectedSubject) return;
    setSubjectForecasts((forecasts) => ({
      ...forecasts,
      [selectedSubject.id]: { ...(forecasts[selectedSubject.id] ?? emptyPlannerForecast), ...update },
    }));
  }

  function updateUpcoming(value: string) {
    const upcoming = normalizePlannerCount(value);
    const upcomingCount = parsePlannerCount(upcoming);
    const existingPlanned = parsePlannerCount(activeForecast.attending);
    updateForecast({
      upcoming,
      attending: existingPlanned === null || upcomingCount === null
        ? ""
        : String(Math.min(existingPlanned, upcomingCount)),
    });
  }

  function updatePlannedAttendance(value: string) {
    const maximum = futureClasses ?? 60;
    updateForecast({ attending: normalizePlannerCount(value, maximum) });
  }

  const neededValue = futureClasses === null
    ? "Enter periods"
    : futureClasses === 0
      ? "No periods"
      : neededInWindow === null
        ? "Not reachable"
        : neededInWindow > futureClasses
          ? `Not within ${futureClasses}`
          : `${neededInWindow} of ${futureClasses}`;
  const neededDescription = futureClasses === null
    ? "Enter the upcoming period count to calculate how many you should attend."
    : futureClasses === 0
      ? "Enter at least one upcoming period to calculate this target."
      : neededInWindow === null
        ? "A 100% target cannot be reached after a previous absence."
        : neededInWindow > futureClasses
          ? consecutiveNeeded === null
            ? `Even attending all ${futureClasses} cannot restore ${target}%.`
            : `Attend all ${futureClasses}, then ${Math.max(0, consecutiveNeeded - futureClasses)} more consecutively to reach ${target}%.`
          : neededInWindow === 0
            ? `You can miss all ${futureClasses} and remain at or above ${target}%.`
            : `Attend at least ${neededInWindow} of these ${futureClasses}; the remaining ${futureClasses - neededInWindow} can be missed.`;

  return <div className="planner-grid">
    <section className="card planner-controls">
      <div className="card-heading"><div><h2>Plan your attendance</h2><p>Choose an overall or subject-wise forecast, then enter the periods you want to plan for.</p></div><span className="metric-icon"><Icon name="target"/></span></div>
      <div className="planner-scope-row">
        <div className="planner-mode-field"><span>Plan scope</span><div className="planner-scope-switch" role="group" aria-label="Attendance plan scope">
          <button type="button" className={scope === "overall" ? "button button-primary" : "button button-quiet"} aria-pressed={scope === "overall"} onClick={() => setScope("overall")}>Overall</button>
          <button type="button" className={scope === "subject" ? "button button-primary" : "button button-quiet"} aria-pressed={scope === "subject"} onClick={() => setScope("subject")} disabled={subjects.length === 0}>Subject-wise</button>
        </div></div>
        {scope === "subject" && <label className="field-label planner-subject-field">Subject
          <select value={selectedSubject?.id ?? ""} onChange={(event) => setSelectedSubjectId(event.target.value)}>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>}
      </div>
      {scope === "subject" && !selectedSubject ? <div className="planner-empty">Add a subject before creating a subject-wise plan.</div> : <>
        <div className="planner-control-row">
          <div className="planner-current"><span>Current {scope === "overall" ? "overall attendance" : "subject attendance"}</span><strong>{formatPercentage(current.percentage)}</strong><span>{current.attended} attended / {current.conducted} conducted periods</span></div>
          <label className="field-label planner-upcoming-field">Upcoming periods
            <input type="number" min="0" max="60" placeholder="Enter a count" value={activeForecast.upcoming} onChange={(event) => updateUpcoming(event.target.value)}/>
            <small>Leave blank until you know how many periods to plan for.</small>
          </label>
          <label className="field-label planner-upcoming-field">Plan to attend
            <input type="number" min="0" max={futureClasses ?? 60} placeholder="Optional" value={activeForecast.attending} disabled={futureClasses === null} onChange={(event) => updatePlannedAttendance(event.target.value)}/>
            <small>Optional. Remaining periods count as missed in your plan.</small>
          </label>
        </div>
        <p className="planner-rule-note">Minimum: <strong>{scope === "overall" ? `${target}% overall` : `${target}% for ${selectedSubject?.name}`}</strong>. Any higher target you have configured still applies.{scope === "overall" ? " Overall attendance is based on total periods, not an average of subject percentages." : " Each subject period is calculated separately."}</p>
      </>}
    </section>

    {!(scope === "subject" && !selectedSubject) && <div className="planner-results">
      <div className="card planner-result"><div className="overline">{futureClasses === null ? "ATTEND ALL UPCOMING" : `ATTEND ALL ${futureClasses}`}</div><strong>{futureClasses === null ? "—" : futureClasses === 0 ? "No periods" : formatPercentage(attendAllScenario)}</strong><p>{futureClasses === null ? "Enter a period count for this forecast." : scope === "overall" ? "Projected overall attendance if you attend every upcoming period." : `Projected ${selectedSubject?.name} attendance if you attend every upcoming period.`}</p></div>
      <div className="card planner-result"><div className="overline">{futureClasses === null ? "MISS ALL UPCOMING" : `MISS ALL ${futureClasses}`}</div><strong>{futureClasses === null ? "—" : futureClasses === 0 ? "No periods" : formatPercentage(missAllScenario)}</strong><p>{futureClasses === null ? "Enter a period count for this forecast." : scope === "overall" ? "Projected overall attendance if you miss every upcoming period." : `Projected ${selectedSubject?.name} attendance if you miss every upcoming period.`}</p></div>
      <div className="card planner-result"><div className="overline">ATTEND TO MEET {targetName.toUpperCase()}</div><strong>{neededValue}</strong><p>{neededDescription}</p></div>
      <div className="card planner-result"><div className="overline">YOUR PLANNED OUTCOME</div><strong>{futureClasses === null ? "Enter periods" : plannedAttendances === null ? "Set your plan" : `${Math.min(plannedAttendances, futureClasses)} of ${futureClasses}`}</strong><p>{plannedProjection === null ? "Set both counts to see the projected attendance for your plan." : `${formatPercentage(plannedProjection)} after attending ${Math.min(plannedAttendances ?? 0, futureClasses ?? 0)} and missing ${(futureClasses ?? 0) - Math.min(plannedAttendances ?? 0, futureClasses ?? 0)} periods.`}</p></div>
      {scope === "subject" && <div className="card planner-result" aria-label="Overall impact of the subject plan">
        <div className="overline">OVERALL IMPACT · {effectiveOverallTarget}% TARGET</div>
        <strong>{formatPercentage(overallPlanned)}</strong>
        {overallPlanned === null && <p>Enter upcoming periods and your planned attendance to see the overall percentage.</p>}
      </div>}
    </div>}
  </div>;
}

function ReportsView({ subjects, records, totals, target, subjectId, onSubjectChange, onExport }: { subjects: Subject[]; records: AttendanceRecord[]; totals: ReturnType<typeof getTotals>; target: number; subjectId: string; onSubjectChange: (id: string) => void; onExport: () => void }) {
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const reportSubjects = selectedSubject ? [selectedSubject] : subjects;
  const reportTotals = selectedSubject ? getSubjectTotals(records, selectedSubject.id) : totals;
  const reportTarget = selectedSubject ? Math.max(75, selectedSubject.requiredAttendance) : Math.max(80, target);
  const belowTarget = subjects.filter((subject) => {
    const summary = getSubjectTotals(records, subject.id);
    return summary.percentage !== null && summary.percentage < subject.requiredAttendance;
  }).length;
  return <>
    <section className="card report-controls">
      <label className="field-label">Report for<select value={subjectId} onChange={(event) => onSubjectChange(event.target.value)}><option value="">Overall attendance · all subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` · ${subject.code}` : ""}</option>)}</select></label>
    </section>
    <div className="report-summary">
      <div className="card report-summary-card"><span>{selectedSubject ? `${selectedSubject.name} attendance` : "Overall attendance"}</span><strong>{formatPercentage(reportTotals.percentage)}</strong></div>
      <div className="card report-summary-card"><span>Periods attended</span><strong>{reportTotals.attended} <small>/ {reportTotals.conducted}</small></strong></div>
      <div className="card report-summary-card"><span>{selectedSubject ? "Required attendance" : "Subjects under target"}</span><strong>{selectedSubject ? `${reportTarget}%` : belowTarget}{!selectedSubject && <small> / {subjects.length}</small>}</strong></div>
    </div>
    <section className="card report-card">
      <div className="report-heading"><div><h2>{selectedSubject ? `${selectedSubject.name} report` : "Subject summary"}</h2><p>Calculated from all date-wise class records</p></div><button className="button button-quiet" onClick={onExport}><Icon name="download"/>Download CSV</button></div>
      {subjects.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Subject</th><th>Attended</th><th>Conducted</th><th>Attendance</th><th>Required</th><th>Standing</th></tr></thead><tbody>
        {reportSubjects.map((subject) => {
          const summary = getSubjectTotals(records, subject.id);
          const health = getHealth(summary.percentage, subject.requiredAttendance);
          return <tr key={subject.id}><td><span className="report-subject"><span className="subject-color" style={{ backgroundColor: subject.color }}/>{subject.name}</span></td><td>{summary.attended}</td><td>{summary.conducted}</td><td><strong>{formatPercentage(summary.percentage)}</strong></td><td>{subject.requiredAttendance}%</td><td><StatusPill health={health}/></td></tr>;
        })}
      </tbody>{!selectedSubject && <tfoot><tr><td><strong>Overall · weighted</strong></td><td><strong>{totals.attended}</strong></td><td><strong>{totals.conducted}</strong></td><td><strong>{formatPercentage(totals.percentage)}</strong></td><td>{target}%</td><td><StatusPill health={getHealth(totals.percentage, target)}/></td></tr></tfoot>}</table></div> : <EmptyState title="Nothing to report yet" copy="Add subjects and class records to build your semester report."/>}
    </section>
    {selectedSubject && <section className="card report-card report-history">
      <div className="report-heading"><div><h2>Date-wise attendance</h2><p>Class records for {selectedSubject.name}</p></div></div>
      {records.some((record) => record.subjectId === selectedSubject.id) ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Date</th><th>Day</th><th>Attended</th><th>Conducted</th><th>Status</th></tr></thead><tbody>{records.filter((record) => record.subjectId === selectedSubject.id).sort((a, b) => b.date.localeCompare(a.date)).map((record) => <tr key={record.id}><td>{formatDate(record.date)}</td><td>{formatDay(record.date)}</td><td>{record.attended}</td><td>{record.periods}</td><td>{getRecordStatus(record)}</td></tr>)}</tbody></table></div> : <EmptyState title="No class records yet" copy="Mark attendance for this subject to see its date-wise report."/>}
    </section>}
    <section className="report-note"><Icon name="target"/><p>Overall attendance is calculated as total periods attended divided by total periods conducted. Subject percentages are shown individually and are not averaged to make the overall figure.</p></section>
  </>;
}

function SemestersView({ semesters, activeSemesterId, onActivate, onArchive, onCreate }: { semesters: Semester[]; activeSemesterId: string; onActivate: (id: string) => void; onArchive: (semester: Semester) => void; onCreate: () => void }) {
  const activeCount = semesters.filter((semester) => !semester.archived).length;
  return <>
    <section className="semester-list">{semesters.map((semester) => <article className={`card semester-row ${semester.archived ? "archived" : ""}`} key={semester.id}>
      <div className="semester-info"><span className="semester-symbol"><Icon name="layers"/></span><div><strong>{semester.name}{semester.id === activeSemesterId && <span className="active-term-tag">Active</span>}{semester.archived && <span className="archived-term-tag">Archived</span>}</strong><span>{semester.startDate ? formatDate(semester.startDate, { month: "short", year: "numeric" }) : "Start date not set"}{semester.endDate ? ` — ${formatDate(semester.endDate, { month: "short", year: "numeric" })}` : " — End date not set"}</span></div></div>
      <div className="semester-actions">{!semester.archived && semester.id === activeSemesterId && <span className="semester-current"><Icon name="check-circle"/> Current</span>}{!semester.archived && semester.id !== activeSemesterId && <button className="button button-quiet" onClick={() => onActivate(semester.id)}>Set active</button>}<button className={`button ${semester.archived ? "button-quiet" : "button-danger"}`} disabled={!semester.archived && activeCount <= 1} title={!semester.archived && activeCount <= 1 ? "Create or restore another active semester first" : undefined} onClick={() => onArchive(semester)}>{semester.archived ? "Restore" : "Archive"}</button></div>
    </article>)}</section>
    <div className="semester-help"><div><strong>Keep each term separate</strong><p>Archived terms stay saved with their subjects, timetable, and attendance history. Restore a term whenever you need it.</p></div><button className="button button-primary" onClick={onCreate}><Icon name="plus"/>Create semester</button></div>
  </>;
}

function SettingsView({ settings, preview, onSave, onDeleteAccount }: {
  settings: WorkspaceSettings; preview: boolean; onSave: (settings: WorkspaceSettings) => void; onDeleteAccount: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return <div className="settings-layout">
    <section className="card settings-card"><h2>Attendance targets</h2><p>Keep these floors at or above your institution’s minimums.</p>
      <label className="settings-field"><span><strong>Overall minimum</strong><span>Weighted across all active subjects. Minimum floor: 80%.</span></span><input type="number" min="80" max="100" value={draft.overallTarget} onChange={(event) => setDraft({ ...draft, overallTarget: Math.max(80, Math.min(100, Number(event.target.value) || 80)) })}/></label>
      <label className="settings-field"><span><strong>Default subject minimum</strong><span>Used when adding a new subject. Minimum floor: 75%.</span></span><input type="number" min="75" max="100" value={draft.defaultSubjectTarget} onChange={(event) => setDraft({ ...draft, defaultSubjectTarget: Math.max(75, Math.min(100, Number(event.target.value) || 75)) })}/></label>
      <div className="settings-note">You can raise a specific subject’s target from its subject card. The overall calculation stays weighted by periods attended and conducted.</div>
    </section>
    <section className="card settings-card"><h2>Appearance and data</h2><p>Choose how Attendly looks on this device.</p>
      <label className="settings-field"><span><strong>Color theme</strong><span>Applies to your dashboard in this browser.</span></span><select className="setting-select" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value as WorkspaceSettings["theme"] })}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <div className="settings-note">{process.env.NEXT_PUBLIC_SUPABASE_URL ? "Your attendance, subjects, semesters, timetable, and targets sync to your Supabase account. Row-level security keeps each student’s data private." : "This front-end preview saves attendance in this browser only. Connect Supabase Auth and PostgreSQL before using it for real records."}</div>
      <PublicLegalLinks className="settings-legal-links" />
      <button className="button button-primary settings-save" onClick={() => onSave(draft)}><Icon name="check"/>Save settings</button>
    </section>
    <section className="card settings-card delete-account-card"><h2>Delete account</h2><p>Remove your Attendly account and permanently erase its saved data.</p>
      <div className="settings-note">This deletes your attendance, subjects, semesters, timetable, and account profile. You’ll confirm your password before deletion.</div>
      <button className="button button-danger settings-save" disabled={preview} onClick={onDeleteAccount}><Icon name="archive"/>{preview ? "Unavailable in preview" : "Delete account and data"}</button>
    </section>
  </div>;
}

function DeleteAccountModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const modalRef = useModalFocus(() => { if (!busy) onClose(); });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (confirmation !== "DELETE") {
      setError('Type DELETE exactly to confirm permanent account deletion.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your account could not be deleted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal confirm-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <div className="modal-header"><div><h2 id="delete-account-title">Delete your account?</h2><p>This permanently erases your account and all saved attendance data.</p></div><button className="icon-button modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">Current password<input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)}/></label>
        <label className="field-label">Type DELETE to confirm<input autoComplete="off" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE"/></label>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Keep my account</button><button className="button button-danger" type="submit" disabled={busy || confirmation !== "DELETE"}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
      </form>
    </section>
  </div>;
}

function AttendanceModal({
  subjects, initialRecord, initialSubjectId, initialDate, onClose, onSave,
}: {
  subjects: Subject[]; initialRecord?: AttendanceRecord; initialSubjectId?: string; initialDate?: string;
  onClose: () => void; onSave: (record: AttendanceRecord) => void;
}) {
  const initialStatus = initialRecord ? getRecordStatus(initialRecord) : "present";
  const initialSubjectIdValue = initialRecord?.subjectId ?? initialSubjectId ?? subjects[0]?.id ?? "";
  const [subjectId, setSubjectId] = useState(initialSubjectIdValue);
  const [date, setDate] = useState(initialRecord?.date ?? initialDate ?? dateKey(new Date()));
  const [periods, setPeriods] = useState(initialRecord?.periods ?? 1);
  const [status, setStatus] = useState<"present" | "absent" | "partial">(initialStatus);
  const [attended, setAttended] = useState(initialRecord?.attended ?? 1);
  const [error, setError] = useState("");
  const modalRef = useModalFocus(onClose);

  function changePeriods(value: number) {
    const next = Math.max(1, Math.min(12, value || 1));
    setPeriods(next);
    if (status === "present") setAttended(next);
    else if (status === "absent") setAttended(0);
    else setAttended((current) => Math.min(current, next));
  }
  function changeStatus(value: "present" | "absent" | "partial") {
    setStatus(value);
    if (value === "present") setAttended(periods);
    if (value === "absent") setAttended(0);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!subjectId) { setError("Choose a subject first."); return; }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Choose a valid class date."); return; }
    if (periods < 1 || periods > 12) { setError("Periods must be between 1 and 12."); return; }
    const countAttended = status === "present" ? periods : status === "absent" ? 0 : attended;
    if (countAttended < 0 || countAttended > periods) { setError("Attended periods must be between 0 and the total periods."); return; }
    onSave({
      id: initialRecord?.id ?? createId(),
      subjectId,
      date,
      periods,
      attended: countAttended,
      ...(initialRecord?.note ? { note: initialRecord.note } : {}),
    });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title">
      <div className="modal-header"><div><h2 id="attendance-modal-title">{initialRecord ? "Edit class record" : "Mark single subject"}</h2><p>Save the class against its date and subject.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">Subject
          <select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.archived ? " · archived" : ""}</option>)}
          </select>
        </label>
        <label className="field-label">Class date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label>
        <div className="form-two-col">
          <label className="field-label">Periods conducted<input type="number" min="1" max="12" required value={periods} onChange={(event) => changePeriods(Number(event.target.value))}/></label>
          <label className="field-label">Attendance status<select value={status} onChange={(event) => changeStatus(event.target.value as "present" | "absent" | "partial")}><option value="present">Present</option><option value="absent">Absent</option><option value="partial">Partially attended</option></select></label>
        </div>
        {status === "partial" && <label className="field-label">Periods attended<input type="number" min="0" max={periods} value={attended} onChange={(event) => setAttended(Math.max(0, Math.min(periods, Number(event.target.value) || 0)))}/></label>}
        {date && <p className="modal-helper">This record will appear under <strong>{formatDay(date)}, {formatDate(date)}</strong>.</p>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Icon name="check"/>{initialRecord ? "Save changes" : "Save attendance"}</button></div>
      </form>
    </section>
  </div>;
}

function WholeDayAttendanceModal({ subjects, records, timetable, semesterId, initialDate, onClose, onSave }: {
  subjects: Subject[]; records: AttendanceRecord[]; timetable: TimetableEntry[]; semesterId: string; initialDate?: string;
  onClose: () => void; onSave: (date: string, status: "present" | "absent") => void;
}) {
  const [date, setDate] = useState(initialDate ?? dateKey(new Date()));
  const modalRef = useModalFocus(onClose);
  const weekday = date ? localDate(date).getDay() : -1;
  const activeSubjectIds = new Set(subjects.map((subject) => subject.id));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const periodsBySubject = new Map<string, Set<number>>();
  for (const entry of timetable) {
    if (entry.semesterId !== semesterId || entry.weekday !== weekday || !activeSubjectIds.has(entry.subjectId)) continue;
    const hours = periodsBySubject.get(entry.subjectId) ?? new Set<number>();
    hours.add(entry.hour);
    periodsBySubject.set(entry.subjectId, hours);
  }
  const scheduledSubjects = [...periodsBySubject.entries()]
    .map(([subjectId, hours]) => ({ subject: subjectById.get(subjectId), hours: [...hours].sort((a, b) => a - b) }))
    .filter((entry): entry is { subject: Subject; hours: number[] } => Boolean(entry.subject))
    .sort((a, b) => a.hours[0] - b.hours[0]);
  const scheduledIds = new Set(scheduledSubjects.map(({ subject }) => subject.id));
  const existingScheduledRecords = records.filter((record) => record.date === date && scheduledIds.has(record.subjectId));
  const totalPeriods = scheduledSubjects.reduce((sum, entry) => sum + entry.hours.length, 0);

  return <div className="modal-backdrop day-attendance-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal day-attendance-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="whole-day-modal-title">
      <div className="modal-header"><div><h2 id="whole-day-modal-title">Mark attendance for a whole day</h2><p>Apply one status to every subject scheduled in your saved Attendly timetable.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <div className="modal-form">
        <label className="field-label">Class date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label>
        <section className="day-attendance-preview" aria-label="Saved timetable for selected day">
          <div className="day-attendance-preview-heading"><strong>{date ? `${formatDay(date)}, ${formatDate(date, { day: "numeric", month: "long", year: "numeric" })}` : "Selected day"}</strong><span>{totalPeriods} {totalPeriods === 1 ? "period" : "periods"}</span></div>
          {scheduledSubjects.length ? <ul>{scheduledSubjects.map(({ subject, hours }) => <li key={subject.id}><span className="subject-color" style={{ backgroundColor: subject.color }}/><strong>{subject.name}</strong><span>{hours.length} {hours.length === 1 ? "period" : "periods"} · Hour{hours.length === 1 ? "" : "s"} {hours.join(", ")}</span></li>)}</ul> : <p>No saved timetable periods for this day. Fill and save the Attendly timetable before marking a whole day.</p>}
        </section>
        {existingScheduledRecords.length > 0 && <p className="day-attendance-warning" role="status">Existing records for these scheduled subjects on this date will be updated to match the whole-day choice. Other subject records will stay unchanged.</p>}
        {scheduledSubjects.length > 0 && <p className="modal-helper">This creates one date-wise attendance record for each scheduled subject, using the number of periods in the timetable.</p>}
        <div className="modal-actions day-attendance-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><div><button type="button" className="button button-quiet" disabled={!scheduledSubjects.length} onClick={() => onSave(date, "absent")}><Icon name="close"/>Mark all absent</button><button type="button" className="button button-primary" disabled={!scheduledSubjects.length} onClick={() => onSave(date, "present")}><Icon name="check"/>Mark all present</button></div></div>
      </div>
    </section>
  </div>;
}

const subjectColors = ["#4f8f78", "#d38b55", "#7785c2", "#bc7186", "#5e9bad", "#8d9c58", "#9b79b3"];

function SubjectModal({
  subject, semesterId, defaultTarget, onClose, onSave,
}: {
  subject?: Subject; semesterId: string; defaultTarget: number; onClose: () => void; onSave: (subject: Subject) => void;
}) {
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState(subject?.code ?? "");
  const required = subject?.requiredAttendance ?? Math.max(75, defaultTarget);
  const color = subject?.color ?? subjectColors[0];
  const [error, setError] = useState("");
  const modalRef = useModalFocus(onClose);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter a subject name."); return; }
    onSave({
      id: subject?.id ?? createId(),
      semesterId,
      name: name.trim(),
      code: code.trim(),
      requiredAttendance: required,
      color,
      archived: subject?.archived ?? false,
    });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="subject-modal-title">
      <div className="modal-header"><div><h2 id="subject-modal-title">{subject ? "Edit subject" : "Add a subject"}</h2><p>Keep subject details here and manage your week in Timetable.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">Subject name<input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Database Systems"/></label>
        <label className="field-label">Subject code <span className="optional-label">Optional</span><input maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. CS 301"/></label>
        <p className="modal-helper">Attendance minimums stay at 80% overall and 75% for each subject.</p>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Icon name="check"/>{subject ? "Save subject" : "Add subject"}</button></div>
      </form>
    </section>
  </div>;
}

function withCurrentOption(options: CollegeSelectOption[], value: string, label: string): CollegeSelectOption[] {
  return value && !options.some((option) => option.value === value) ? [{ value, label }, ...options] : options;
}

function SemesterModal({ defaultAcademicProfile, onClose, onSave }: {
  defaultAcademicProfile?: StudentAcademicProfile | null;
  onClose: () => void;
  onSave: (semester: Semester) => void;
}) {
  const [name, setName] = useState("");
  const [academicOptions, setAcademicOptions] = useState<SvceTimetableOptions>(SVCE_FALLBACK_OPTIONS);
  const [department, setDepartment] = useState(defaultAcademicProfile?.departmentCode ?? "");
  const [academicYear, setAcademicYear] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [section, setSection] = useState(defaultAcademicProfile?.sectionCode ?? "none");
  const [error, setError] = useState("");
  const modalRef = useModalFocus(onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/svce-timetable?mode=options", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((result: { options?: SvceTimetableOptions }) => {
        if (controller.signal.aborted || !result.options?.departments?.length || !result.options.academicYears?.length || !result.options.years?.length || !result.options.sections?.length) return;
        setAcademicOptions(result.options);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const departmentOptions = withCurrentOption(academicOptions.departments, department, defaultAcademicProfile?.department ?? "Previously selected department");
  const academicYearOptions = withCurrentOption(academicOptions.academicYears, academicYear, defaultAcademicProfile?.academicYear ?? "Previously selected academic year");
  const sectionOptions = withCurrentOption(academicOptions.sections, section, defaultAcademicProfile?.section ?? "Previously selected section");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Give this semester a name."); return; }
    const selectedDepartment = departmentOptions.find((option) => option.value === department);
    const selectedAcademicYear = academicYearOptions.find((option) => option.value === academicYear);
    const selectedSection = sectionOptions.find((option) => option.value === section);
    const yearNumber = Number(studyYear);
    const semesterValue = Number(semesterNumber);
    if (!selectedDepartment || !selectedAcademicYear || !selectedSection || !Number.isInteger(yearNumber) || !Number.isInteger(semesterValue) || Math.ceil(semesterValue / 2) !== yearNumber) {
      setError("Complete the department, section, year, semester, and academic year details.");
      return;
    }
    onSave({
      id: createId(),
      name: name.trim(),
      startDate: dateKey(new Date()),
      endDate: "",
      archived: false,
      academicProfile: {
        department: selectedDepartment.label,
        departmentCode: selectedDepartment.value,
        section: selectedSection.label,
        sectionCode: selectedSection.value,
        studyYear: yearNumber,
        semester: semesterValue,
        academicYear: selectedAcademicYear.label,
        academicYearCode: selectedAcademicYear.value,
        collegeTimetableUrl: null,
      },
    });
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="semester-modal-title">
      <div className="modal-header"><div><h2 id="semester-modal-title">Create a semester</h2><p>Set the academic details used to fetch this semester’s college timetable.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">Semester name<input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Semester 06"/></label>
        <div className="signup-profile-grid">
          <label className="field-label signup-department-field">Department
            <select required value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">Choose department</option>{departmentOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-label">Academic year
            <select required value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              <option value="">Choose academic year</option>{academicYearOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-label">Year of study
            <select required value={studyYear} onChange={(event) => {
              setStudyYear(event.target.value);
              setSemesterNumber("");
              setName((current) => /^semester\s+\d+$/i.test(current) ? "" : current);
            }}>
              <option value="">Choose year</option>{academicOptions.years.map((option, index) => <option value={String(index + 1)} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-label">Semester
            <select required value={semesterNumber} disabled={!studyYear} onChange={(event) => {
              const nextSemester = event.target.value;
              setSemesterNumber(nextSemester);
              if (nextSemester) setName((current) => !current.trim() || /^semester\s+\d+$/i.test(current) ? `Semester ${String(nextSemester).padStart(2, "0")}` : current);
            }}>
              <option value="">Choose semester</option>{(studyYear ? [Number(studyYear) * 2 - 1, Number(studyYear) * 2] : []).map((value) => <option value={String(value)} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field-label">Section
            <select required value={section} onChange={(event) => setSection(event.target.value)}>
              {sectionOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Icon name="check"/>Create semester</button></div>
      </form>
    </section>
  </div>;
}

function ConfirmModal({ title, copy, action, onClose, onConfirm }: { title: string; copy: string; action: string; onClose: () => void; onConfirm: () => void }) {
  const modalRef = useModalFocus(onClose);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal confirm-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="modal-header"><div><h2 id="confirm-modal-title">{title}</h2></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>
      <p className="confirm-copy">{copy}</p>
      <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-danger" onClick={onConfirm}><Icon name="archive"/>{action}</button></div>
    </section>
  </div>;
}
