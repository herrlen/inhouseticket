import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/csp";
import { NOINDEX } from "./src/lib/indexing";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // The proxy (src/proxy.ts) buffers request bodies of the routes it matches – pages and their
    // Server Actions only. Those are capped at 1 MB by Next.js anyway; 10 MB (default) only costs memory.
    proxyClientMaxBodySize: "1mb",
  },
  // The CSP itself needs a per-request nonce and is set in src/proxy.ts.
  // X-Robots-Tag for pages comes from src/proxy.ts; API and MCP skip the proxy and get it here.
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: NOINDEX }];
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: noindex },
      { source: "/mcp", headers: noindex },
      { source: "/mcp/:path*", headers: noindex },
    ];
  },
};

export default nextConfig;
