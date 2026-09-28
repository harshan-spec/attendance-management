export type AttendanceStatus = "present" | "absent" | "partial";

export interface Semester {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  archived: boolean;
}

export interface Subject {
  id: string;
  semesterId: string;
  name: string;
  code: string;
  credits: number;
  requiredAttendance: number;
  color: string;
  archived: boolean;
}

export interface TimetableEntry {
  semesterId: string;
  weekday: number;
  hour: number;
  subjectId: string;
}

export interface AttendanceRecord {
  id: string;
  subjectId: string;
  date: string;
  periods: number;
  attended: number;
  note?: string;
}

export interface WorkspaceSettings {
  overallTarget: number;
  defaultSubjectTarget: number;
  theme: "light" | "dark";
}

export interface WorkspaceData {
  semesters: Semester[];
  activeSemesterId: string;
  subjects: Subject[];
  records: AttendanceRecord[];
  timetable: TimetableEntry[];
  settings: WorkspaceSettings;
}

export interface AttendanceTotals {
  attended: number;
  conducted: number;
  percentage: number | null;
}

export type AttendanceHealth = "safe" | "watch" | "critical" | "empty";
