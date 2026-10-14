import Link from "next/link";

export function PublicLegalLinks({ className = "", includePrivacy = false }: { className?: string; includePrivacy?: boolean }) {
  return <nav className={`public-legal-links ${className}`} aria-label="Legal and support pages">
    {includePrivacy && <Link href="/privacy">Privacy</Link>}
    <Link href="/terms">Terms</Link><Link href="/about">About</Link><Link href="/guides">Guide</Link><Link href="/contact">Contact</Link>
  </nav>;
}
