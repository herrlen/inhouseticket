# Prompts für Claude Code in VS Code – inhouseticket.com

## 0. Vorbereitung (manuell, einmalig)
```bash
mkdir inhouseticket && cd inhouseticket
git init
mkdir docs
# KONZEPT.md + SPRINTPLANNING.md nach docs/ kopieren, CLAUDE.md in den Root
gh repo create inhouseticket --private --source=. --remote=origin
git add . && git commit -m "chore: initial docs" && git push -u origin main
```
Dann in VS Code das Claude-Code-Panel öffnen und Prompt 1 einfügen.

---

## Prompt 1 – Projekt-Setup (Sprint 0)

```
Lies CLAUDE.md, docs/KONZEPT.md und docs/SPRINTPLANNING.md vollständig.

Setze Sprint 0 um:
1. Next.js (App Router, TypeScript strict, Tailwind, ESLint, src/-Ordner) mit pnpm im aktuellen Ordner aufsetzen.
2. Drizzle + PostgreSQL einrichten (docker-compose.yml mit Postgres 16 für lokal, .env.example).
3. Komplettes Datenbankschema aus docs/KONZEPT.md → Abschnitt „Datenmodell“ in src/db/schema.ts anlegen und erste Migration erzeugen.
4. src/lib/limits.ts mit allen Limits aus CLAUDE.md anlegen.
5. src/lib/freemail.ts mit Blockliste + Funktion isCompanyEmail(email) und Vitest-Tests.
6. Design-Tokens aus docs/KONZEPT.md als CSS-Variablen (Light + Dark) in globals.css und in tailwind config mappen. Inter + JetBrains Mono über next/font.
7. Ordnerstruktur wie in CLAUDE.md beschrieben anlegen.
8. Scripts in package.json: dev, build, lint, typecheck, test, test:e2e, db:generate, db:migrate, db:studio.
9. GitHub Actions Workflow: lint + typecheck + test bei jedem Push.
10. Dockerfile (multi-stage, standalone output).

Arbeite schrittweise, führe nach jedem Schritt typecheck aus. Committe mit Conventional Commits. Frag nach, bevor du Dependencies hinzufügst, die nicht in CLAUDE.md stehen. Am Ende: kurze Zusammenfassung + was ich manuell tun muss (.env, DB starten).
```

---

## Prompt-Vorlage für jeden weiteren Sprint

```
Lies CLAUDE.md und den Abschnitt „Sprint [N]“ in docs/SPRINTPLANNING.md.

Setze alle Stories aus Sprint [N] um. Für jede Story:
- erst kurz planen (Dateien, die du anlegst/änderst),
- dann implementieren,
- Limits und Workspace-Scope serverseitig erzwingen,
- Tests schreiben (Unit für Logik, ein Playwright-Test für den Happy Path),
- typecheck + lint + test ausführen, Fehler beheben,
- committen.

Hake erledigte Stories in docs/SPRINTPLANNING.md ab. Wenn etwas unklar ist oder dem Konzept widerspricht: stoppen und fragen.
```

---

## Nützliche Einzel-Prompts

**Performance-Check**
```
Analysiere das Bundle (next build) und die wichtigsten Routen. Finde alles, was Interaktionen > 100 ms oder LCP > 1,5 s verursacht. Liste Probleme nach Impact, dann behebe die Top 3.
```

**Security-Review Mandantentrennung**
```
Prüfe jede Datei in src/db/queries und src/app/api: Gibt es irgendeine Query ohne workspaceId-Filter oder ohne requireMember()? Liste Fundstellen mit Datei:Zeile und behebe sie.
```

**UI-Review**
```
Gehe alle Komponenten in src/components durch und prüfe gegen docs/KONZEPT.md → Design: Tokens statt Hardcoded-Farben, Fokus-Ringe, Dark Mode, Kontrast AA, Tastatur-Bedienbarkeit. Behebe Abweichungen.
```
