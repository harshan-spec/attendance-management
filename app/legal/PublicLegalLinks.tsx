import Link from "next/link";

export function PublicLegalLinks({ className = "" }: { className?: string }) {
  return <nav className={`public-legal-links ${className}`} aria-label="Legal and support pages">
    <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact</Link>
  </nav>;
}
