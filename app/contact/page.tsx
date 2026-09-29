import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/app/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact Attendly",
  description: "Contact Attendly for support with your account and attendance workspace.",
  alternates: { canonical: "/contact" },
};

const configuredEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
const supportEmail = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(configuredEmail) ? configuredEmail : null;

export default function ContactPage() {
  return <LegalPage title="Contact Attendly" summary="For account and product support, use the contact details below.">
    <LegalSection title="Support">
      {supportEmail ? <p>Email us at <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Please do not include your password or verification codes in a support message.</p> : <div className="legal-contact-note"><strong>Support email is not configured yet.</strong><p>If you can sign in, you can update or export your records in Attendly. To permanently remove your account and its records, use <strong>Settings → Delete account</strong>. For a sign-in problem, try the password recovery page.</p><p><Link href="/forgot-password">Recover your password</Link></p></div>}
    </LegalSection>
    <LegalSection title="Other pages">
      <p>See our <Link href="/privacy">Privacy policy</Link> and <Link href="/terms">Terms of use</Link>.</p>
    </LegalSection>
  </LegalPage>;
}
