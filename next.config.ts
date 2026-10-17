import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/csp";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // The proxy (src/proxy.ts) buffers request bodies of the routes it matches – pages and their
    // Server Actions only. Those are capped at 1 MB by Next.js anyway; 10 MB (default) only costs memory.
    proxyClientMaxBodySize: "1mb",
  },
  // The CSP itself needs a per-request nonce and is set in src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
