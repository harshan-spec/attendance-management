export function safeLoginRedirect(requestedPath: string | null, origin: string): string {
  if (!requestedPath?.startsWith("/") || requestedPath.startsWith("//")) return "/dashboard";
  try {
    const destination = new URL(requestedPath, origin);
    return destination.origin === origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
