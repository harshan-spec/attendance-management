"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPercentage } from "@/lib/attendance";
import { Icon } from "@/app/dashboard/Icons";
import { PublicLegalLinks } from "@/app/legal/PublicLegalLinks";
import { CalculatorAd } from "./CalculatorAd";

export function AttendanceCalculator() {
  const [attendedText, setAttendedText] = useState("42");
  const [conductedText, setConductedText] = useState("50");
  const [targetText, setTargetText] = useState("75");
  const attended = attendedText === "" ? null : Number(attendedText);
  const conducted = conductedText === "" ? null : Number(conductedText);
  const target = targetText === "" ? null : Number(targetText);
  const invalidCount = (attended !== null && (!Number.isSafeInteger(attended) || attended < 0)) ||
    (conducted !== null && (!Number.isSafeInteger(conducted) || conducted < 0));
  const countError = invalidCount
    ? "Enter whole, non-negative period counts."
    : attended !== null && conducted !== null && attended > conducted
      ? "Attended periods cannot be greater than conducted periods."
      : null;
  const targetError = target !== null && (!Number.isFinite(target) || target < 0 || target > 100)
    ? "Choose a target between 0% and 100%."
    : null;
  const percentage = attended !== null && conducted !== null && conducted > 0 && !countError
    ? (attended / conducted) * 100
    : null;
  const resultCopy = countError ?? (attended === null || conducted === null
    ? "Enter both period counts to calculate attendance."
    : conducted === 0
      ? "No attendance recorded yet."
      : `Based on ${attended} of ${conducted} periods.`);

  return <div className="calculator-page">
    <header className="calculator-header">
      <Link href="/login" className="brand"><span className="brand-mark"><Icon name="check"/></span><span>attendly<span className="brand-period">.</span></span></Link>
      <nav aria-label="Public navigation"><Link href="/attendance-calculator">Calculator</Link><Link href="/login">Sign in <Icon name="external"/></Link></nav>
    </header>
    <main className="calculator-main">
      <div className="eyebrow">FREE ATTENDANCE TOOL</div>
      <h1>Attendance percentage calculator</h1>
      <p className="calculator-intro">Find your attendance from the periods you’ve attended and the periods your subject has conducted. The result updates as you enter your numbers.</p>
      <section className="calculator-signin" aria-label="Sign in to Attendly">
        <div><strong>Sign in to track your attendance</strong><p>Save your class records and access subject reports, your timetable, and the planner.</p></div>
        <Link href="/login" className="button button-primary">Sign in <Icon name="external"/></Link>
      </section>
      <section className="card calculator-card" aria-label="Attendance calculator">
        <div className="calculator-inputs">
          <label className="field-label">Periods attended<input type="number" inputMode="numeric" min="0" step="1" value={attendedText} onChange={(event) => setAttendedText(event.target.value)} aria-describedby="period-error"/></label>
          <label className="field-label">Periods conducted<input type="number" inputMode="numeric" min="0" step="1" value={conductedText} onChange={(event) => setConductedText(event.target.value)} aria-describedby="period-error"/></label>
          <label className="field-label">Required attendance (%)<input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={targetText} onChange={(event) => setTargetText(event.target.value)} aria-describedby="target-error"/></label>
        </div>
        <div className="calculator-result">
          <div><span className="calculator-result-label">YOUR ATTENDANCE</span><strong>{formatPercentage(percentage)}</strong><p>{resultCopy}</p></div>
          {percentage !== null && target !== null && !targetError && <span className="status-pill">{percentage >= target ? `Meets ${target}% target` : `${(target - percentage).toFixed(2)}% below target`}</span>}
        </div>
        {countError && <p className="calculator-error" id="period-error" role="alert">{countError}</p>}
        {targetError && <p className="calculator-error" id="target-error" role="alert">{targetError}</p>}
      </section>
      <section className="card calculator-explainer">
        <h2>Subject-wise attendance formula</h2>
        <div className="calculator-formula"><span>Periods attended</span><b>÷</b><span>Periods conducted</span><b>× 100</b><b>=</b><span>{formatPercentage(percentage)}</span></div>
        <p>For example, 42 attended periods out of 50 conducted periods gives you 84.00% attendance. Count each period, including multi-period practicals, in both totals.</p>
      </section>
      <CalculatorAd />
      <section className="calculator-faq" aria-labelledby="calculator-faq-title">
        <h2 id="calculator-faq-title">A few useful details</h2>
        <details><summary>How is overall attendance different?</summary><p>Overall attendance uses the sum of attended periods across all subjects divided by the sum of conducted periods. It is not the average of your subject percentages.</p></details>
        <details><summary>What does 0 conducted periods mean?</summary><p>No percentage can be calculated until at least one class period has been conducted. Attendly shows “No attendance recorded” instead of treating 0 ÷ 0 as a percentage.</p></details>
        <details><summary>Can I track attendance by day?</summary><p>Yes. In your Attendly dashboard, each class record includes its date, day, subject, period count, and present or absent status.</p></details>
      </section>
    </main>
    <footer className="calculator-footer"><span>Attendly · Built for clearer semesters</span><PublicLegalLinks /></footer>
  </div>;
}
