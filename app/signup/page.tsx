import type { Metadata } from "next";
import { AuthPanel } from "@/app/auth/AuthPanel";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <AuthPanel mode="signup" />;
}
