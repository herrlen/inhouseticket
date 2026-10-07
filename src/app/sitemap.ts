import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Public pages only. AGB/AVV join once they are reviewed and linked.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!env.SITE_INDEXABLE) return [];
  const url = (path: string) => new URL(path, env.APP_URL).toString();
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/impressum"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/datenschutz"), changeFrequency: "monthly", priority: 0.2 },
  ];
}
