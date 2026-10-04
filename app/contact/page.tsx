import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/app/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact Attendly",
  description: "Contact Attendly for support with your account and attendance workspace.",
  alternates: { canonical: "/contact" },
};

const supportEmail = "attendly.noreply123@gmail.com";

export default function ContactPage() {
  return <LegalPage title="Contact Attendly" summary="For account and product support, use the contact details below.">
    <LegalSection title="Support">
      <p>Email us at <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}`} target="_blank" rel="noopener noreferrer">{supportEmail}</a>.</p>
      <p>Click the email address to compose a message to Attendly admin in Gmail. Gmail opens in a new tab.</p>
    </LegalSection>
  </LegalPage>;
}
