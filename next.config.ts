import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/csp";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The CSP itself needs a per-request nonce and is set in src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
