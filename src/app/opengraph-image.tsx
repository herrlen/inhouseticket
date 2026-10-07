import { ImageResponse } from "next/og";

// Link preview for LinkedIn, OMR, Slack & Co. (1200×630), in the app's colours.
export const alt = "inhouseticket – Tickets für dein Team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const rows = [
    { key: "WEB-3", title: "Ladezeit der Produktseiten unter 1 s", status: "#3a86ff", prio: "#ef4444" },
    { key: "WEB-1", title: "Startseite: Hero-Bereich neu gestalten", status: "#3a86ff", prio: "#f97316" },
    { key: "MES-1", title: "Standfläche buchen", status: "#78716c", prio: "#ef4444" },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fafaf9", padding: 72, fontFamily: "sans-serif", color: "#1c1917" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
          inhouse<span style={{ color: "#5b5bf7" }}>ticket</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Tickets für dein Team – schnell, schlicht, kostenlos.</div>
          <div style={{ fontSize: 28, color: "#78716c", marginTop: 20 }}>Liste · Kanban · Auslastung · Claude – gehostet in Deutschland</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e7e5e4", borderRadius: 10, background: "#ffffff" }}>
          {rows.map((r, i) => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", padding: "14px 22px", borderTop: i ? "1px solid #e7e5e4" : "none", fontSize: 24 }}>
              <span style={{ width: 120, color: "#78716c", fontFamily: "monospace" }}>{r.key}</span>
              <span style={{ flex: 1 }}>{r.title}</span>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: r.status, marginRight: 24 }} />
              <span style={{ width: 14, height: 14, borderRadius: 3, background: r.prio }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
