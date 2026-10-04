import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return <main className="legal-page">
    <header className="legal-header">
      <Link className="legal-brand" href="/attendance-calculator">attendly<span>.</span></Link>
      <Link className="legal-back" href="/login">Sign in</Link>
    </header>
    <article className="legal-content">
      <p className="legal-eyebrow">ATTENDLY · SUPPORT</p>
      <h1>{title}</h1>
      <p className="legal-summary">{summary}</p>
      {children}
      <nav className="legal-page-links" aria-label="Legal and support pages">
        <Link href="/contact">Contact</Link>
      </nav>
    </article>
  </main>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h2>{title}</h2>{children}</section>;
}
