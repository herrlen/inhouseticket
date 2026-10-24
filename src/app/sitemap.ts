import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Public pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!env.SITE_INDEXABLE) return [];
  const url = (path: string) => new URL(path, SITE_URL).toString();
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/umziehen"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/impressum"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/datenschutz"), changeFrequency: "monthly", priority: 0.2 },
    { url: url("/agb"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/avv"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
