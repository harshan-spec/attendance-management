import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { WorkspaceData } from "@/lib/types";
import type { StudentAcademicProfile } from "@/lib/svce-timetable";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBJECT_TYPES, validateInternalMarks, type SubjectType } from "@/lib/internal-marks";

export const dynamic = "force-dynamic";

const RECORD_PAGE_SIZE = 1000;
const MAX_WORKSPACE_RECORDS = 10_000;
const MAX_WORKSPACE_PAYLOAD_BYTES = 4_000_000;

type AttendanceRow = {
  id: string;
  subject_id: string;
  attendance_date: string;
  periods: number;
  attended: number;
  note: string | null;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isAcademicProfile(value: unknown): value is StudentAcademicProfile {
  if (!isObject(value) || typeof value.department !== "string" || !value.department.trim() || value.department.length > 120 ||
      typeof value.departmentCode !== "string" || !value.departmentCode.trim() || value.departmentCode.length > 40 ||
      typeof value.section !== "string" || !value.section.trim() || value.section.length > 40 ||
      typeof value.sectionCode !== "string" || !value.sectionCode.trim() || value.sectionCode.length > 40 ||
      !Number.isInteger(value.studyYear) || (value.studyYear as number) < 1 || (value.studyYear as number) > 4 ||
      !Number.isInteger(value.semester) || (value.semester as number) < 1 || (value.semester as number) > 8 ||
      Math.ceil((value.semester as number) / 2) !== value.studyYear ||
      typeof value.academicYear !== "string" || !value.academicYear.trim() || value.academicYear.length > 40 ||
      typeof value.academicYearCode !== "string" || !value.academicYearCode.trim() || value.academicYearCode.length > 40) return false;

  if (value.collegeTimetableUrl === null) return true;
  if (typeof value.collegeTimetableUrl !== "string" || value.collegeTimetableUrl.length > 2048) return false;
  try {
    const url = new URL(value.collegeTimetableUrl);
    return url.protocol === "https:" && url.hostname === "www.svce.ac.in" && url.pathname.startsWith("/timetable/files/") && url.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function isWorkspace(value: unknown): value is WorkspaceData {
  if (!isObject(value) || !Array.isArray(value.semesters) || !Array.isArray(value.subjects) ||
      !Array.isArray(value.records) || !Array.isArray(value.timetable) || !isObject(value.settings)) return false;
  if (value.semesters.length > 24 || value.subjects.length > 120 || value.records.length > 10000 || value.timetable.length > 840) return false;

  const semesters = new Map<string, JsonObject>();
  for (const semester of value.semesters) {
    if (!isObject(semester) || !isUuid(semester.id) || typeof semester.name !== "string" || semester.name.trim().length < 1 || semester.name.length > 60 ||
        !isDate(semester.startDate) || !(semester.endDate === "" || isDate(semester.endDate)) || typeof semester.archived !== "boolean" ||
        (semester.academicProfile !== undefined && !isAcademicProfile(semester.academicProfile))) return false;
    if (semester.endDate && semester.endDate < semester.startDate) return false;
    if (semesters.has(semester.id)) return false;
    semesters.set(semester.id, semester);
  }

  if (typeof value.activeSemesterId !== "string" || (value.activeSemesterId !== "" && !semesters.has(value.activeSemesterId))) return false;

  const subjects = new Map<string, string>();
  for (const subject of value.subjects) {
    if (!isObject(subject) || !isUuid(subject.id) || !isUuid(subject.semesterId) || !semesters.has(subject.semesterId) ||
        typeof subject.name !== "string" || subject.name.trim().length < 1 || subject.name.length > 80 ||
        typeof subject.code !== "string" || subject.code.length > 20 ||
        typeof subject.requiredAttendance !== "number" || subject.requiredAttendance < 75 || subject.requiredAttendance > 100 ||
        typeof subject.color !== "string" || subject.color.length > 20 || typeof subject.archived !== "boolean" || subjects.has(subject.id) ||
        (subject.subjectType !== undefined && !SUBJECT_TYPES.includes(subject.subjectType as SubjectType)) ||
        (subject.internalMarks !== undefined && !validateInternalMarks((subject.subjectType ?? "theory") as SubjectType, subject.internalMarks))) return false;
    subjects.set(subject.id, subject.semesterId);
  }

  const recordIds = new Set<string>();
  for (const record of value.records) {
    if (!isObject(record) || !isUuid(record.id) || !isUuid(record.subjectId) || !subjects.has(record.subjectId) || !isDate(record.date) ||
        !Number.isInteger(record.periods) || (record.periods as number) < 1 || (record.periods as number) > 12 ||
        !Number.isInteger(record.attended) || (record.attended as number) < 0 || (record.attended as number) > (record.periods as number) ||
        (record.note !== undefined && (typeof record.note !== "string" || record.note.length > 140)) || recordIds.has(record.id)) return false;
    recordIds.add(record.id);
  }

  const timetableSlots = new Set<string>();
  for (const entry of value.timetable) {
    if (!isObject(entry) || !isUuid(entry.semesterId) || !semesters.has(entry.semesterId) || !isUuid(entry.subjectId) ||
        subjects.get(entry.subjectId) !== entry.semesterId || !Number.isInteger(entry.weekday) || (entry.weekday as number) < 1 || (entry.weekday as number) > 5 ||
        !Number.isInteger(entry.hour) || (entry.hour as number) < 1 || (entry.hour as number) > 7) return false;
    const slot = `${entry.semesterId}:${entry.weekday}:${entry.hour}`;
    if (timetableSlots.has(slot)) return false;
    timetableSlots.add(slot);
  }

  const settings = value.settings;
  return typeof settings.overallTarget === "number" && settings.overallTarget >= 80 && settings.overallTarget <= 100 &&
    typeof settings.defaultSubjectTarget === "number" && settings.defaultSubjectTarget >= 75 && settings.defaultSubjectTarget <= 100 &&
    (settings.theme === "light" || settings.theme === "dark");
}

async function loadAttendanceRecords(supabase: SupabaseClient) {
  const records: AttendanceRow[] = [];
  for (let offset = 0; offset < MAX_WORKSPACE_RECORDS; offset += RECORD_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("id,subject_id,attendance_date,periods,attended,note")
      .order("attendance_date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + RECORD_PAGE_SIZE - 1);
    if (error) return { records: null, error: error.message, tooMany: false };

    const page = (data ?? []) as AttendanceRow[];
    records.push(...page);
    if (page.length < RECORD_PAGE_SIZE) return { records, error: null, tooMany: false };
  }

  const { data: overflow, error } = await supabase
    .from("attendance_records")
    .select("id")
    .range(MAX_WORKSPACE_RECORDS, MAX_WORKSPACE_RECORDS);
  if (error) return { records: null, error: error.message, tooMany: false };
  if (overflow?.length) return { records: null, error: null, tooMany: true };
  return { records, error: null, tooMany: false };
}

function serviceUnavailable() {
  return Response.json({ error: "Supabase is not configured for this deployment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function unauthorized() {
  return Response.json({ error: "Please sign in to access this workspace." }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!isSupabaseConfigured) return serviceUnavailable();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const [semesterResult, subjectResult, recordResult, timetableResult, settingsResult] = await Promise.all([
    supabase.from("semesters").select("id,name,start_date,end_date,is_archived,is_active,academic_profile").order("start_date", { ascending: true }),
    supabase.from("subjects").select("id,semester_id,name,code,required_attendance,color,is_archived,subject_type,internal_marks").order("name", { ascending: true }),
    loadAttendanceRecords(supabase),
    supabase.from("timetable_entries").select("semester_id,subject_id,weekday,hour").order("weekday", { ascending: true }).order("hour", { ascending: true }),
    supabase.from("attendance_settings").select("overall_target,default_subject_target,theme").maybeSingle(),
  ]);
  if (recordResult.tooMany) {
    return Response.json({ error: "This workspace has more than 10,000 class records and cannot be loaded safely." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const failed = [semesterResult, subjectResult, timetableResult, settingsResult].some((result) => result.error) || Boolean(recordResult.error);
  if (failed || !recordResult.records) return Response.json({ error: "Your workspace could not be loaded. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });

  const semesters = (semesterResult.data ?? []).map((semester) => ({
    id: semester.id,
    name: semester.name,
    startDate: semester.start_date,
    endDate: semester.end_date ?? "",
    archived: semester.is_archived,
    ...(isAcademicProfile(semester.academic_profile) ? { academicProfile: semester.academic_profile } : {}),
  }));
  const activeSemester = (semesterResult.data ?? []).find((semester) => semester.is_active) ?? semesterResult.data?.[0];
  const workspace: WorkspaceData = {
    semesters,
    activeSemesterId: activeSemester?.id ?? "",
    subjects: (subjectResult.data ?? []).map((subject) => ({
      id: subject.id,
      semesterId: subject.semester_id,
      name: subject.name,
      code: subject.code,
      requiredAttendance: Number(subject.required_attendance),
      color: subject.color,
      archived: subject.is_archived,
      subjectType: SUBJECT_TYPES.includes(subject.subject_type as SubjectType) ? subject.subject_type as SubjectType : "theory",
      internalMarks: validateInternalMarks((SUBJECT_TYPES.includes(subject.subject_type as SubjectType) ? subject.subject_type : "theory") as SubjectType, subject.internal_marks) ? subject.internal_marks : {},
    })),
    records: recordResult.records.map((record) => ({
      id: record.id,
      subjectId: record.subject_id,
      date: record.attendance_date,
      periods: record.periods,
      attended: record.attended,
      ...(record.note ? { note: record.note } : {}),
    })),
    timetable: (timetableResult.data ?? []).map((entry) => ({
      semesterId: entry.semester_id,
      subjectId: entry.subject_id,
      weekday: entry.weekday,
      hour: entry.hour,
    })),
    settings: settingsResult.data ? {
      overallTarget: Math.max(80, Number(settingsResult.data.overall_target)),
      defaultSubjectTarget: Number(settingsResult.data.default_subject_target),
      theme: settingsResult.data.theme as "light" | "dark",
    } : { overallTarget: 80, defaultSubjectTarget: 75, theme: "light" },
  };

  const responseBody = JSON.stringify({ workspace });
  if (new TextEncoder().encode(responseBody).byteLength > MAX_WORKSPACE_PAYLOAD_BYTES) {
    return Response.json({ error: "This workspace is too large to load in one request." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(responseBody, { headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" } });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured) return serviceUnavailable();
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WORKSPACE_PAYLOAD_BYTES) return Response.json({ error: "This workspace is too large to save." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "The workspace payload is not valid JSON." }, { status: 400 });
  }
  const workspace = isObject(payload) ? payload.workspace : null;
  if (!isWorkspace(workspace)) return Response.json({ error: "The workspace contains invalid attendance or timetable data." }, { status: 400 });

  const { error } = await supabase.rpc("save_attendly_workspace", { p_workspace: workspace });
  if (error) return Response.json({ error: "Your changes could not be saved. Please retry." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
}
