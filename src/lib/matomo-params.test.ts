import { describe, expect, it } from "vitest";
import { anonymizeIp, trackingParams } from "./matomo-params";

describe("anonymizeIp", () => {
  it("keeps two bytes of IPv4", () => {
    expect(anonymizeIp("94.134.12.200")).toBe("94.134.0.0");
    expect(anonymizeIp(" ::ffff:10.1.2.3 ")).toBe("10.1.0.0");
  });

  it("keeps 48 bits of IPv6", () => {
    expect(anonymizeIp("2a01:4f8:c17:1234::1")).toBe("2a01:4f8:c17::");
    expect(anonymizeIp("2a01::1")).toBe("2a01:0:0::");
    expect(anonymizeIp("2a01:4f8:c17:1:2:3:4:5")).toBe("2a01:4f8:c17::");
  });

  it("drops anything that is not an address", () => {
    expect(anonymizeIp("")).toBe("");
    expect(anonymizeIp("unknown")).toBe("");
  });
});

describe("trackingParams", () => {
  it("removes values only the proxy may set and the tracker's visitor ids", () => {
    const p = trackingParams(new URLSearchParams("idsite=99&cip=1.2.3.4&token_auth=x&rec=0&cdt=1&_id=abc&url=https://x/&action_name=Start"));
    expect([...p.keys()]).toEqual(["url", "action_name"]);
  });

  it("bounds value length and parameter count", () => {
    expect(trackingParams(new URLSearchParams({ url: "x".repeat(3000) })).size).toBe(0);
    const many = new URLSearchParams(Array.from({ length: 150 }, (_, i) => [`k${i}`, "v"]));
    expect(trackingParams(many).size).toBe(100);
  });
});
