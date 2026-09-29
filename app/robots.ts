import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://attendance-management-beta-flax.vercel.app";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/"] }],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
