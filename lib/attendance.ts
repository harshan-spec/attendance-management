import type {
  AttendanceHealth,
  AttendanceRecord,
  AttendanceTotals,
} from "@/lib/types";

export function getTotals(records: AttendanceRecord[]): AttendanceTotals {
  const attended = records.reduce((sum, record) => sum + record.attended, 0);
  const conducted = records.reduce((sum, record) => sum + record.periods, 0);
  return {
    attended,
    conducted,
    percentage: conducted === 0 ? null : (attended / conducted) * 100,
  };
}

export function getHealth(
  percentage: number | null,
  target: number,
): AttendanceHealth {
  if (percentage === null) return "empty";
  if (percentage < target) return "critical";
  if (percentage < Math.min(100, target + 5)) return "watch";
  return "safe";
}

export function getRecordStatus(
  record: AttendanceRecord,
): "present" | "absent" | "partial" {
  if (record.attended === 0) return "absent";
  if (record.attended === record.periods) return "present";
  return "partial";
}

export function formatPercentage(value: number | null, digits = 2): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

export function formatDay(dateString: string): string {
  const date = localDate(dateString);
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
}

export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(localDate(dateString));
}

export function localDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function afterAttending(
  totals: AttendanceTotals,
  futureClasses: number,
): number | null {
  if (totals.conducted + futureClasses === 0) return null;
  return ((totals.attended + futureClasses) / (totals.conducted + futureClasses)) * 100;
}

export function afterMissing(
  totals: AttendanceTotals,
  futureClasses: number,
): number | null {
  if (totals.conducted + futureClasses === 0) return null;
  return (totals.attended / (totals.conducted + futureClasses)) * 100;
}

export function classesNeeded(
  totals: AttendanceTotals,
  targetPercent: number,
): number | null {
  if (targetPercent > 100) return null;
  const target = targetPercent / 100;
  if (target <= 0 || (totals.percentage !== null && totals.percentage >= targetPercent)) return 0;
  if (target >= 1) return totals.conducted === 0 ? 1 : null;
  const needed = Math.max(0, Math.ceil((target * totals.conducted - totals.attended) / (1 - target) - 1e-10));
  let answer = needed;
  while ((totals.attended + answer) / Math.max(1, totals.conducted + answer) + 1e-10 < target) {
    answer += 1;
  }
  while (answer > 0 && (totals.attended + answer - 1) / Math.max(1, totals.conducted + answer - 1) + 1e-10 >= target) {
    answer -= 1;
  }
  return answer;
}

export function classesToAttendWithinUpcoming(
  totals: AttendanceTotals,
  targetPercent: number,
  upcomingClasses: number,
): number | null {
  if (targetPercent > 100) return null;
  if (upcomingClasses <= 0 && totals.conducted === 0) return null;
  const target = targetPercent / 100;
  const required = target * (totals.conducted + upcomingClasses) - totals.attended;
  return Math.max(0, Math.ceil(required - 1e-10));
}

export function classesThatCanBeMissed(
  totals: AttendanceTotals,
  targetPercent: number,
): number | null {
  if (targetPercent <= 0) return null;
  if (totals.percentage === null || totals.percentage < targetPercent) return 0;
  const target = targetPercent / 100;
  if (target >= 1) return totals.attended === totals.conducted ? 0 : 0;
  const answer = Math.max(0, Math.floor(totals.attended / target - totals.conducted + 1e-10));
  return answer;
}

export function getSubjectTotals(
  records: AttendanceRecord[],
  subjectId: string,
): AttendanceTotals {
  return getTotals(records.filter((record) => record.subjectId === subjectId));
}
