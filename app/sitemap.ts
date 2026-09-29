import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://attendance-management-beta-flax.vercel.app";
  return [
    { url: new URL("/attendance-calculator", siteUrl).toString(), changeFrequency: "monthly", priority: 1 },
    { url: new URL("/privacy", siteUrl).toString(), changeFrequency: "yearly", priority: 0.4 },
    { url: new URL("/terms", siteUrl).toString(), changeFrequency: "yearly", priority: 0.4 },
    { url: new URL("/contact", siteUrl).toString(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
