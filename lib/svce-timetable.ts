export interface CollegeSelectOption {
  value: string;
  label: string;
}

export interface SvceTimetableOptions {
  departments: CollegeSelectOption[];
  academicYears: CollegeSelectOption[];
  years: CollegeSelectOption[];
  sections: CollegeSelectOption[];
}

export interface StudentAcademicProfile {
  department: string;
  departmentCode: string;
  section: string;
  sectionCode: string;
  studyYear: number;
  semester: number;
  academicYear: string;
  academicYearCode: string;
  collegeTimetableUrl: string | null;
}

export const SVCE_FALLBACK_OPTIONS: SvceTimetableOptions = {
  departments: [
    { value: "aut", label: "Mechanical Engineering (Automobile)" },
    { value: "ads", label: "Artificial Intelligence and Data Science" },
    { value: "amn", label: "Mechanical and Automation Engineering" },
    { value: "bio", label: "Biotechnology" },
    { value: "cse", label: "Computer Science Engineering" },
    { value: "che", label: "Chemical Engineering" },
    { value: "cve", label: "Civil Engineering" },
    { value: "ece", label: "Electronics & Communication Engineering" },
    { value: "eee", label: "Electrical & Electronics Engineering" },
    { value: "mar", label: "Marine Engineering" },
    { value: "mec", label: "Mechanical Engineering" },
    { value: "it", label: "Information Technology" },
  ],
  academicYears: [
    { value: "2023", label: "2023" },
    { value: "2024", label: "2024" },
    { value: "2025", label: "2025" },
    { value: "2026", label: "2026-27" },
  ],
  years: [
    { value: "1st_year", label: "1st Year" },
    { value: "2nd_year", label: "2nd Year" },
    { value: "3rd_year", label: "3rd Year" },
    { value: "4th_year", label: "4th Year" },
  ],
  sections: [
    { value: "none", label: "No Section" },
    { value: "A", label: "A" },
    { value: "B", label: "B" },
    { value: "C", label: "C" },
    { value: "D", label: "D" },
    { value: "E", label: "E" },
    { value: "F", label: "F" },
    { value: "PG", label: "PG" },
  ],
};

export function getStudyYearLabel(year: number) {
  const ordinal = year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : "4th";
  return `${ordinal} Year`;
}
