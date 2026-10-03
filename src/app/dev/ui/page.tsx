import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PALETTE_COLORS } from "@/lib/palette";
import { MAX_TITLE } from "@/lib/limits";
import { Interactive } from "./interactive";

export const metadata: Metadata = { title: "UI-Bausteine" };

/** Development-only preview of the UI primitives (light/dark, keyboard). */
export default function UiPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">UI-Bausteine</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Ticket anlegen</Button>
          <Button>Abbrechen</Button>
          <Button variant="ghost">Mehr</Button>
          <Button variant="danger">Projekt löschen</Button>
          <Button disabled>Deaktiviert</Button>
          <Button size="sm">Klein</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone={{ kind: "priority", value: "urgent" }}>Dringend</Badge>
          <Badge tone={{ kind: "priority", value: "high" }}>Hoch</Badge>
          <Badge tone={{ kind: "priority", value: "medium" }}>Mittel</Badge>
          <Badge tone={{ kind: "priority", value: "low" }}>Niedrig</Badge>
          <Badge tone={{ kind: "priority", value: "none" }}>Keine</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge pill tone={{ kind: "status", value: "open" }}>Offen</Badge>
          <Badge pill tone={{ kind: "status", value: "active" }}>In Arbeit</Badge>
          <Badge pill tone={{ kind: "status", value: "review" }}>Review</Badge>
          <Badge pill tone={{ kind: "status", value: "done" }}>Erledigt</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {PALETTE_COLORS.map((color) => (
            <Badge key={color} tone={{ kind: "palette", color }}>
              {color}
            </Badge>
          ))}
        </div>
        <p className="font-mono text-sm">MKT-142</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Avatare</h2>
        <div className="flex flex-wrap items-center gap-2">
          {["Anna Schmidt", "Max Mustermann", "Lea", "Jonas Weber", "Mia Klein", "Paul Neumann"].map((name, i) => (
            <Avatar key={name} user={{ id: `user-${i}`, name }} />
          ))}
          <Avatar user={null} />
          <Avatar size="sm" user={{ id: "x", name: "Klein" }} />
          <Avatar size="lg" user={{ id: "y", name: "Groß Gestellt" }} />
        </div>
      </section>

      <Interactive maxTitle={MAX_TITLE} />
    </main>
  );
}
