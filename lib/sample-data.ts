import type { AttendanceRecord, Subject, TimetableEntry, WorkspaceData } from "@/lib/types";
import { dateKey } from "@/lib/attendance";

const semesterId = "semester-autumn-2026";

const sampleSubjects: Subject[] = [
  {
    id: "subject-database",
    semesterId,
    name: "Database Systems",
    code: "CS 301",
    credits: 4,
    requiredAttendance: 75,
    color: "#4f8f78",
    archived: false,
  },
  {
    id: "subject-networks",
    semesterId,
    name: "Computer Networks",
    code: "CS 304",
    credits: 3,
    requiredAttendance: 75,
    color: "#d38b55",
    archived: false,
  },
  {
    id: "subject-operating-systems",
    semesterId,
    name: "Operating Systems",
    code: "CS 302",
    credits: 4,
    requiredAttendance: 75,
    color: "#7785c2",
    archived: false,
  },
  {
    id: "subject-data-structures",
    semesterId,
    name: "Data Structures",
    code: "CS 303",
    credits: 4,
    requiredAttendance: 75,
    color: "#bc7186",
    archived: false,
  },
  {
    id: "subject-mathematics",
    semesterId,
    name: "Discrete Mathematics",
    code: "MA 305",
    credits: 3,
    requiredAttendance: 75,
    color: "#5e9bad",
    archived: false,
  },
];

const sampleClassDays: Record<string, number[]> = {
  "subject-database": [2, 4],
  "subject-networks": [1, 5],
  "subject-operating-systems": [1, 3, 5],
  "subject-data-structures": [2, 4],
  "subject-mathematics": [1, 3, 4],
};

const sampleTimetableRows = [
  ["subject-operating-systems", "subject-database", "subject-networks", "subject-database", "subject-operating-systems"],
  ["subject-mathematics", "subject-data-structures", "subject-operating-systems", "subject-mathematics", "subject-networks"],
  ["subject-database", "subject-networks", "subject-database", "subject-data-structures", "subject-mathematics"],
  ["", "subject-mathematics", "subject-mathematics", "subject-networks", "subject-database"],
  ["subject-networks", "subject-operating-systems", "subject-data-structures", "subject-operating-systems", "subject-data-structures"],
  ["subject-data-structures", "", "subject-operating-systems", "", ""],
  ["", "", "", "", ""],
];

const sampleTimetable: TimetableEntry[] = sampleTimetableRows.flatMap((row, hourIndex) => row.flatMap((subjectId, dayIndex) => subjectId ? [{
  semesterId,
  weekday: dayIndex + 1,
  hour: hourIndex + 1,
  subjectId,
}] : []));

function buildSampleRecords(today: Date): AttendanceRecord[] {
  const start = new Date(2026, 6, 1, 12);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const policies: Record<string, { missEvery: number; missOffset: number; doubleEvery: number; extraMissAt?: number[] }> = {
    "subject-database": { missEvery: 7, missOffset: 3, doubleEvery: 5 },
    "subject-networks": { missEvery: 4, missOffset: 1, doubleEvery: 6, extraMissAt: [2] },
    "subject-operating-systems": { missEvery: 6, missOffset: 4, doubleEvery: 5 },
    "subject-data-structures": { missEvery: 5, missOffset: 2, doubleEvery: 7 },
    "subject-mathematics": { missEvery: 9, missOffset: 5, doubleEvery: 6 },
  };
  const records: AttendanceRecord[] = [];

  for (const subject of sampleSubjects) {
    let classIndex = 0;
    const policy = policies[subject.id];
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      if (!sampleClassDays[subject.id].includes(date.getDay())) continue;
      classIndex += 1;
      const periods = classIndex % policy.doubleEvery === 0 ? 2 : 1;
      const absent = classIndex % policy.missEvery === policy.missOffset || Boolean(policy.extraMissAt?.includes(classIndex));
      records.push({
        id: `sample-${subject.id}-${dateKey(date)}`,
        subjectId: subject.id,
        date: dateKey(date),
        periods,
        attended: absent ? 0 : periods,
      });
    }
  }
  return records;
}

export function createSampleWorkspace(today = new Date()): WorkspaceData {
  return {
    semesters: [
      {
        id: semesterId,
        name: "Semester 05",
        startDate: "2026-07-01",
        endDate: "2026-11-30",
        archived: false,
      },
    ],
    activeSemesterId: semesterId,
    subjects: sampleSubjects,
    records: buildSampleRecords(today),
    timetable: sampleTimetable,
    settings: {
      overallTarget: 80,
      defaultSubjectTarget: 75,
      theme: "light",
    },
  };
}
