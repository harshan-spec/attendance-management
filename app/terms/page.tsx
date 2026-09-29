import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/app/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using Attendly's attendance tracking and planning tools.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage title="Terms of use" summary="These terms cover use of Attendly's attendance tracking tools and personal workspace.">
    <p className="legal-updated">Effective September 29, 2026</p>
    <LegalSection title="What Attendly provides">
      <p>Attendly helps you record attendance, organize subjects and semesters, review timetables, and estimate how future classes may change attendance percentages. Its default targets are 80% overall attendance and 75% per subject; the applicable rules of your institution take precedence.</p>
      <p>Attendly is an independent student tool and is not an official Sri Venkateswara College of Engineering service. A college timetable PDF is shown as a reference; it does not automatically fill or verify your Attendly timetable or attendance records.</p>
    </LegalSection>
    <LegalSection title="Your records and account">
      <p>You are responsible for entering accurate dates, subjects, period counts, and attendance statuses, and for keeping your sign-in credentials secure. Attendance calculations and planner forecasts depend on the information you enter. Verify important decisions against your institution's official records and policies.</p>
      <p>Do not use Attendly to access another person's account, disrupt the service, or store information you are not permitted to use. You can export reports before deleting your account. Account deletion permanently removes your Attendly account and related workspace records.</p>
    </LegalSection>
    <LegalSection title="Availability and changes">
      <p>Features, external timetable availability, and service availability can change. Attendly cannot guarantee that a college PDF will always be available or that its contents are current. You remain responsible for maintaining your own records and checking official sources.</p>
    </LegalSection>
    <LegalSection title="Contact">
      <p>For questions about these terms, visit the <Link href="/contact">Contact page</Link>.</p>
    </LegalSection>
  </LegalPage>;
}
