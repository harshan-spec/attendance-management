import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://attendance-management-beta-flax.vercel.app";
  return [{
    url: new URL("/attendance-calculator", siteUrl).toString(),
    changeFrequency: "monthly",
    priority: 1,
  }];
}
