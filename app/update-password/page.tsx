import type { Metadata } from "next";
import { AuthPanel } from "@/app/auth/AuthPanel";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function UpdatePasswordPage() {
  return <AuthPanel mode="update" />;
}
