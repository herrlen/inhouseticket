"use client";

import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

export function Interactive({ maxTitle }: { maxTitle: number }) {
  return (
    <ToastProvider>
      <Demo maxTitle={maxTitle} />
    </ToastProvider>
  );
}

function Demo({ maxTitle }: { maxTitle: number }) {
  const toast = useToast();

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Eingabe</h2>
        <Input label="Titel" maxLength={maxTitle} showCounter placeholder="Was ist zu tun?" />
        <Input label="E-Mail" type="email" error="Bitte eine Firmen-E-Mail verwenden." defaultValue="max@gmail.com" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Dropdown, Tooltip, Toast</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            trigger="Priorität ▾"
            items={[
              { label: "Dringend", onSelect: () => toast({ message: "Priorität: Dringend" }) },
              { label: "Hoch", onSelect: () => toast({ message: "Priorität: Hoch" }) },
              { label: "Mittel", onSelect: () => toast({ message: "Priorität: Mittel" }), disabled: true },
              { label: "Niedrig", onSelect: () => toast({ message: "Priorität: Niedrig" }) },
              { label: "Löschen", onSelect: () => toast({ message: "Gelöscht" }), danger: true },
            ]}
          />
          <Tooltip content="Neues Ticket (C)">
            <Button variant="primary">+ Ticket</Button>
          </Tooltip>
          <Button onClick={() => toast({ message: "Gespeichert", tone: "success" })}>Erfolg</Button>
          <Button
            onClick={() =>
              toast({
                message: "Status konnte nicht geändert werden.",
                tone: "error",
                action: { label: "Erneut versuchen", onClick: () => toast({ message: "Erneut gesendet" }) },
              })
            }
          >
            Fehler
          </Button>
        </div>
      </section>
    </>
  );
}
