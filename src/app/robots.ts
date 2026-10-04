import type { MetadataRoute } from "next";

// Closed beta: keep everything out of search engines until launch (Sprint 9).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
