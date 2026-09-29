import type { Metadata } from "next";
import { AuthPanel } from "@/app/auth/AuthPanel";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <AuthPanel mode="forgot" />;
}
