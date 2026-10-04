import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/app/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Learn what Attendly stores, how it is used, and how to remove your account data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" summary="This page explains the information Attendly processes when you use the attendance calculator, dashboard, account, and timetable features.">
    <p className="legal-updated">Effective October 4, 2026</p>
    <LegalSection title="Information you enter">
      <p>An account uses your email address, display name, phone number, and academic profile (department, section, study year, semester, academic year, and an optional link to the college timetable). Your Attendly workspace can contain subjects, dated attendance records and notes, your weekly timetable, attendance targets, and display preferences.</p>
      <p>The public calculator works without an account and calculates from the numbers you enter in that page. Preview mode stores its sample workspace in this browser only. Signing in stores your account workspace with Supabase.</p>
    </LegalSection>
    <LegalSection title="How information is used">
      <p>Attendly uses account and workspace information to sign you in, save and display your records, calculate attendance, plan future classes, and provide account recovery and deletion.</p>
      <p>If you request a college timetable, Attendly's server retrieves the selected public PDF from the Sri Venkateswara College of Engineering website and displays the original document as a reference. The college website may receive normal network request information when that file is fetched.</p>
    </LegalSection>
    <LegalSection title="Storage and service providers">
      <p>Supabase provides account authentication and the database. Vercel hosts the website and its server routes. These providers process information as needed to operate their services and may retain technical logs under their own policies. Attendly does not sell attendance or academic profile data.</p>
      <p>Authenticated database access is restricted to the account owner. The login session is maintained using authentication cookies. Preview data is stored in browser storage and can be removed by clearing this browser's site data.</p>
    </LegalSection>
    <LegalSection title="Advertising on the public calculator">
      <p>The public attendance calculator uses Google AdSense to display advertisements when ads are available. Google and its advertising partners may use cookies, IP addresses, device identifiers, and browsing information to serve and measure ads, including personalized ads where permitted and consented to. Attendly does not send the calculator's entered period counts or your saved academic and attendance records to Google for advertising.</p>
      <p>Learn how Google uses data on <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">sites that use its services</a>. You can manage personalized advertising through <a href="https://myadcenter.google.com/" target="_blank" rel="noreferrer">Google My Ad Center</a> and use your browser's cookie controls. Where a consent message is shown, you can choose or manage your advertising consent there.</p>
    </LegalSection>
    <LegalSection title="Retention and deletion">
      <p>Your saved workspace remains associated with your account until you remove it or delete the account. Use <strong>Settings → Delete account</strong> while signed in to permanently delete the account and its related Attendly records. This action cannot be undone. Provider operational logs or backups, if any, are governed by the relevant provider's retention practices.</p>
      <p>You can export attendance reports as CSV before deleting your account. Do not include information about other students in your records.</p>
    </LegalSection>
    <LegalSection title="Your choices and contact">
      <p>You can edit your workspace in Attendly, export reports, or delete your account from Settings. For privacy questions, visit the <Link href="/contact">Contact page</Link>.</p>
    </LegalSection>
    <LegalSection title="Updates">
      <p>This notice may be updated when Attendly's features or data practices change. The effective date at the top will be revised when the notice changes.</p>
    </LegalSection>
  </LegalPage>;
}
