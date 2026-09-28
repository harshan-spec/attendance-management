import type { Metadata } from "next";
import { AttendanceCalculator } from "@/app/attendance-calculator/AttendanceCalculator";

export const metadata: Metadata = {
  title: "Attendance percentage calculator",
  description: "Calculate subject attendance from periods attended and periods conducted.",
};

export default function AttendanceCalculatorPage() {
  return <AttendanceCalculator />;
}
