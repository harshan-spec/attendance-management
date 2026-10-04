import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://attendance-management-beta-flax.vercel.app"),
  title: {
    default: "Attendly — Attendance, in focus",
    template: "%s | Attendly",
  },
  description:
    "A calm, clear place to track attendance by subject, review class history, and plan ahead.",
  icons: { icon: "/favicon.svg" },
  other: { "google-adsense-account": "ca-pub-2851684575995607" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
