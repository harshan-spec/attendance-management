import type { Metadata } from "next";
import { AttendanceCalculator } from "@/app/attendance-calculator/AttendanceCalculator";

export const metadata: Metadata = {
  title: "Attendance percentage calculator",
  description: "Free attendance calculator for subject-wise or overall percentages, with clear formulas and period-based examples.",
  alternates: { canonical: "/attendance-calculator" },
};

export default function AttendanceCalculatorPage() {
  return <AttendanceCalculator />;
}
