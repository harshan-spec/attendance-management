export const SUBJECT_TYPES = ["theory", "theory-practices", "laboratory"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export const INTERNAL_MARK_KEYS = ["cat1", "assignment1", "cat2", "assignment2", "cat3", "assignment3", "model"] as const;
export type InternalMarkKey = (typeof INTERNAL_MARK_KEYS)[number];
export type InternalMarks = Partial<Record<InternalMarkKey, number | null>>;

export function markKeysForType(type: SubjectType): InternalMarkKey[] {
  return type === "laboratory" ? ["cat1", "cat2", "cat3", "model"] : [...INTERNAL_MARK_KEYS].filter((key) => key !== "model");
}

export function markLimit(key: InternalMarkKey) { return key === "model" ? 100 : 50; }

export function validateInternalMarks(type: SubjectType, value: unknown): value is InternalMarks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marks = value as Record<string, unknown>;
  const allowed = new Set(markKeysForType(type));
  return Object.entries(marks).every(([key, mark]) => {
    if (!INTERNAL_MARK_KEYS.includes(key as InternalMarkKey) || !allowed.has(key as InternalMarkKey)) return false;
    return mark === null || (typeof mark === "number" && Number.isFinite(mark) && mark >= 0 && mark <= markLimit(key as InternalMarkKey));
  });
}

export function calculateInternal(type: SubjectType, marks: InternalMarks = {}) {
  const keys = markKeysForType(type);
  const entered = keys.filter((key) => typeof marks[key] === "number").length;
  if (!entered) return { score: null, maximum: type === "theory" ? 40 : type === "laboratory" ? 60 : 50, percentage: null, passMark: type === "theory" ? 23 : type === "laboratory" ? 30 : 27, complete: false, entered, totalInputs: keys.length, passed: null as boolean | null };
  const value = (key: InternalMarkKey) => marks[key] ?? 0;
  let score: number;
  let maximum: number;
  let passMark: number;
  if (type === "theory") {
    score = ((value("cat1") + value("cat2") + value("cat3")) * 0.7 + (value("assignment1") + value("assignment2") + value("assignment3")) * 0.3) / 3 * 0.8;
    maximum = 40;
    passMark = 23;
  } else if (type === "theory-practices") {
    score = ((value("cat1") * 0.7 + value("assignment1") * 0.3) + (value("cat2") * 0.7 + value("assignment2") * 0.3) + (value("cat3") * 0.7 + value("assignment3") * 0.3)) / 3;
    maximum = 50;
    passMark = 27;
  } else {
    score = ((value("cat1") + value("cat2") + value("cat3")) / 3) * 0.8 + value("model") * 0.2;
    maximum = 60;
    passMark = 30;
  }
  const complete = entered === keys.length;
  return { score, maximum, percentage: score / maximum * 100, passMark, complete, entered, totalInputs: keys.length, passed: complete ? score >= passMark : null };
}
