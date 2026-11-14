# inhouseticket auf einem eigenen Server (Hetzner)

Anleitung für eine Firmen-Instanz: inhouseticket läuft auf einem eigenen Hetzner-Server unter einer
Subdomain der Firma (Beispiel hier: `tickets.firma.de`), verschickt Mails über das Postfach der Firma
und übernimmt alle Aufgaben aus ClickUp. Jeder Schritt ist zum Kopieren gedacht – Platzhalter in
`<spitzen Klammern>` ersetzen, alles andere genau so eingeben.

Auf dem Server werden **weder Node noch pnpm noch der Quellcode** gebraucht – nur Docker. Die App kommt als
fertiges Image aus der GitHub Container Registry (`ghcr.io/herrlen/inhouseticket`), gebaut von der CI für
jeden grünen Commit auf `main`.

---

## Überblick

Was entsteht:

```
Internet ──443/80──▶ Caddy (Zertifikat von Let's Encrypt, automatisch erneuert)
                        │
                        ▼
                     App (inhouseticket, Port 3000, nur intern)
                        │
                        ▼
                     PostgreSQL 16 (nur intern, Volume pgdata – der einzige Zustand)
```

- Ein Server, drei Container, gestartet per `docker compose` aus `/opt/inhouseticket`.
- Alles liegt in der Datenbank – auch Anhänge. Eine Datenbank-Sicherung ist eine vollständige Sicherung.
- Die Instanz läuft im **Firmenmodus** (`SELF_HOSTED=true`): `https://tickets.firma.de/` führt direkt zur
  Anmeldung, es gibt keine Landingpage, Suchmaschinen bleiben draußen, statt unserer AGB/AVV/Rechtstexte
  verlinkt die App Impressum und Datenschutz der Firma.
- Registrieren dürfen sich nur Adressen der Firmen-Domain(s) und Eingeladene; Gmail, GMX & Co. sind gesperrt.
- Pro Workspace höchstens 100 Personen (Mitglieder + offene Einladungen).

Kosten grob (Stand November 2026, netto, bitte in der Cloud Console prüfen):

| Posten | Preis |
|---|---|
| Hetzner Cloud CX22 (2 vCPU, 4 GB RAM, 40 GB SSD, IPv4 + IPv6) | ca. 4–5 € / Monat |
| Hetzner-Backups (7 tägliche Abbilder) | +20 % vom Serverpreis, ca. 1 € / Monat |
| Domain/Subdomain, SMTP-Postfach | vorhanden (Firma) |

**Servergröße:** CX22 reicht für 100 Personen und den Umzug von ~17 000 ClickUp-Aufgaben. Der Abgleich
liest Seite für Seite und schreibt sofort (nichts wird komplett im Speicher gesammelt); die App ist auf
1,5 GB begrenzt, PostgreSQL auf 1 GB, Caddy auf 256 MB – zusammen bleibt genug Luft im 4-GB-Server.
Falls Hetzner den CX22 nicht mehr anbietet: den Nachfolger mit 2 vCPU / 4 GB nehmen (Kostenoptimiert,
x86/Intel bzw. AMD). Nicht ARM (CAX) – das Image wird nur für `linux/amd64` gebaut.

---

## Voraussetzungen

- Ein Hetzner-Cloud-Konto (<https://console.hetzner.cloud>), Zahlungsmittel hinterlegt.
- Zugang zum DNS der Firmen-Domain (dort, wo `firma.de` verwaltet wird: z. B. IONOS, Strato, Cloudflare, INWX).
- Ein SMTP-Postfach der Firma, z. B. `tickets@firma.de`: Server, Port, Benutzer, Passwort.
  **Port 587 (STARTTLS) verwenden** – Hetzner sperrt bei neuen Konten ausgehend Port 25 und 465.
- Ein GitHub-Konto mit Zugriff auf das Paket `ghcr.io/herrlen/inhouseticket` (dein Konto `herrlen`).
- Ein Windows-PC mit PowerShell (alle Befehle für den PC sind PowerShell).
- Die URLs von Impressum und Datenschutzerklärung der Firma (z. B. `https://www.firma.de/impressum`).
  Die Datenschutzerklärung der Firma sollte die interne Nutzung von inhouseticket abdecken
  (Beschäftigtendaten, Server bei Hetzner in Deutschland, ggf. ClickUp als Quelle während des Umzugs).
- Für den Umzug: ein ClickUp-Konto, das alle zu übernehmenden Spaces sieht (am besten Admin/Owner).

---

## 1 Hetzner-Server bestellen

### 1.1 SSH-Schlüssel auf dem Windows-PC anlegen

PowerShell öffnen (Start → „PowerShell“) und eingeben:

```powershell
ssh-keygen -t ed25519 -C "len@firma-tickets"
```

- Speicherort mit Enter bestätigen (`C:\Users\<du>\.ssh\id_ed25519`).
- Eine Passphrase vergeben (empfohlen) und merken.

Hast du schon einen Schlüssel (`id_ed25519` existiert), kannst du ihn weiterverwenden – dann bei der Frage
nach dem Überschreiben `n` antworten.

Öffentlichen Schlüssel in die Zwischenablage kopieren:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
```

### 1.2 Server anlegen

In der Cloud Console: Projekt öffnen (oder „Neues Projekt“ → Name `inhouseticket`) → **Server hinzufügen**:

1. **Standort:** Nürnberg oder Falkenstein (Deutschland).
2. **Image:** Ubuntu **24.04**.
3. **Typ:** Shared vCPU → x86 → **CX22** (2 vCPU, 4 GB RAM, 40 GB).
4. **Networking:** Öffentliche IPv4 und IPv6 **an** lassen.
5. **SSH-Keys:** „SSH-Key hinzufügen“ → aus der Zwischenablage einfügen → Name `len-pc` → auswählen.
   (Mit SSH-Key setzt Hetzner kein Root-Passwort – Anmeldung nur per Schlüssel.)
6. **Firewalls:** „Firewall erstellen“ → Name `inhouseticket` → eingehende Regeln:

   | Protokoll | Port | Quelle |
   |---|---|---|
   | ICMP | – | Any IPv4, Any IPv6 |
   | TCP | 22 | Any IPv4, Any IPv6 (oder nur die Büro-IP, wenn fest) |
   | TCP | 80 | Any IPv4, Any IPv6 |
   | TCP | 443 | Any IPv4, Any IPv6 |
   | UDP | 443 | Any IPv4, Any IPv6 (HTTP/3, optional) |

   Ausgehend: nichts eintragen (= alles erlaubt). Firewall erstellen und beim Server auswählen.
   Port 80 muss offen sein – darüber holt Caddy das Zertifikat.
7. **Backups:** Häkchen **an** (+20 %).
8. **Name:** `inhouseticket`.
9. **Kostenpflichtig erstellen**.

Nach ca. 30 Sekunden steht der Server. Notiere aus der Übersicht:

- **IPv4**, z. B. `203.0.113.10`
- **IPv6**, angezeigt als Netz `2a01:4f8:xxxx:xxxx::/64` – die Adresse des Servers ist dieses Netz mit `1`
  am Ende: `2a01:4f8:xxxx:xxxx::1`

---

## 2 DNS: Subdomain auf den Server zeigen lassen

Beim DNS-Anbieter der Firmen-Domain zwei Einträge anlegen:

| Typ | Name / Host | Wert | TTL |
|---|---|---|---|
| A | `tickets` | `<IPv4 des Servers>` | 3600 (oder Standard) |
| AAAA | `tickets` | `<IPv6 des Servers>` (mit `::1` am Ende) | 3600 (oder Standard) |

Manche Anbieter wollen den vollen Namen (`tickets.firma.de`), andere nur `tickets`.
Eine bestehende CNAME- oder Weiterleitungs-Regel für `tickets` vorher löschen.

Prüfen in PowerShell (kann je nach Anbieter 5 Minuten bis wenige Stunden dauern):

```powershell
nslookup tickets.firma.de
Resolve-DnsName tickets.firma.de -Type A
Resolve-DnsName tickets.firma.de -Type AAAA
```

Erst weitermachen mit Schritt 6, wenn hier die Adressen des Servers erscheinen. Die Schritte 3–5 gehen
schon vorher.

> Gibt es kein IPv6 beim DNS-Anbieter oder im Zweifel: nur den A-Eintrag anlegen. Ein **falscher**
> AAAA-Eintrag ist schlimmer als keiner (Let's Encrypt bevorzugt IPv6).

---

## 3 Per SSH verbinden und absichern

### 3.1 Verbinden

```powershell
ssh root@<IPv4 des Servers>
```

Beim ersten Mal fragt SSH nach dem Fingerabdruck → `yes`. Danach ggf. die Passphrase des Schlüssels.
Alle folgenden Befehle laufen **auf dem Server** (Eingabeaufforderung `root@inhouseticket:~#`).

### 3.2 Updates und automatische Sicherheitsupdates

```bash
apt update && apt -y full-upgrade
apt -y install unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Europe/Berlin
```

- `unattended-upgrades` spielt Sicherheitsupdates täglich selbst ein.
- `fail2ban` sperrt IPs nach wiederholten falschen SSH-Anmeldungen (Standard-Regel für SSH ist aktiv).

Passwort-Anmeldung per SSH endgültig abschalten (nur Schlüssel):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-nur-schluessel.conf
sshd -t && systemctl reload ssh
```

Falls ein Neustart nötig ist (Kernel-Update), jetzt:

```bash
[ -f /var/run/reboot-required ] && reboot
```

Nach einem `reboot` eine Minute warten und neu verbinden (`ssh root@<IPv4>`).

> Wir arbeiten bewusst als `root` – auf einem Server, der nur diese eine Aufgabe hat, ist das die
> einfachste sichere Variante (Anmeldung nur per Schlüssel, Firewall davor). `ufw` bitte **nicht**
> zusätzlich einschalten: Docker umgeht ufw-Regeln ohnehin, die Hetzner-Firewall ist der Schutz.

---

## 4 Docker installieren (offizielles Docker-Repository)

```bash
apt -y install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Prüfen:

```bash
docker version --format 'Docker {{.Server.Version}}'
docker compose version
```

Beide Befehle müssen eine Version ausgeben. Docker startet ab jetzt bei jedem Boot automatisch.

---

## 5 GitHub-Token anlegen und Dateien holen

Das Paket `ghcr.io/herrlen/inhouseticket` ist privat. Der Server braucht deshalb einen **klassischen**
GitHub-Token, der nur Pakete lesen darf. (Fein granulierte Tokens funktionieren mit ghcr.io nicht.)

### 5.1 Token erzeugen (im Browser)

1. <https://github.com> → oben rechts dein Avatar → **Settings**.
2. Links ganz unten **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
3. **Generate new token** → **Generate new token (classic)**.
4. **Note:** `inhouseticket Server tickets.firma.de`
5. **Expiration:** `Custom` → ein Datum in 12 Monaten (in den Kalender eintragen – danach gehen Updates
   erst wieder mit neuem Token, die laufende Instanz ist nicht betroffen).
6. **Scopes:** nur **`read:packages`** anhaken. Sonst nichts.
7. **Generate token** → Token (`ghp_…`) kopieren. GitHub zeigt ihn nur einmal.

### 5.2 Am Server anmelden (Token landet nicht in der Shell-History)

```bash
read -r -s -p "GitHub-Token: " GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u herrlen --password-stdin
unset GHCR_TOKEN
```

Beim Einfügen erscheint nichts (verdeckte Eingabe) – Enter drücken. Erwartet: `Login Succeeded`.
Docker merkt sich die Anmeldung in `/root/.docker/config.json` (nur für root lesbar) für spätere Updates.

### 5.3 Dateien aus dem Image holen

Die Server-Dateien (`docker-compose.yml`, `Caddyfile`, Skripte) liegen im Image unter `/selfhost` –
ein Zugriff auf das Git-Repository ist nicht nötig.

```bash
mkdir -p /opt/inhouseticket && cd /opt/inhouseticket
docker pull ghcr.io/herrlen/inhouseticket:main
cid=$(docker create ghcr.io/herrlen/inhouseticket:main)
docker cp "$cid:/selfhost/." .
docker rm "$cid"
chmod 700 *.sh
ls -la
```

Erwartet: `.env.example`, `Caddyfile`, `backup.sh`, `docker-compose.yml`, `install.sh`, `restore.sh`, `update.sh`.

> Kommt `Could not find the file /selfhost`, ist das Image älter als diese Anleitung – dann ist der PR
> „Selbst hosten“ noch nicht auf `main` gemergt bzw. die CI noch nicht durch.

---

## 6 Einrichten mit install.sh

Vorher bereitlegen: Subdomain, deine Admin-Adresse, Firmen-Domain(s), Firmenname, die beiden
Rechtstexte-URLs, SMTP-Daten.

```bash
cd /opt/inhouseticket
./install.sh
```

Das Skript fragt der Reihe nach (Enter übernimmt den Vorschlag in eckigen Klammern):

| Frage | Beispiel | Bedeutung |
|---|---|---|
| Subdomain | `tickets.firma.de` | Adresse der Instanz, ohne `https://` |
| Deine E-Mail-Adresse | `len@firma.de` | Betreiber (Zugang zu `/admin`) und Kontakt für Let's Encrypt |
| Firmen-Domain(s) | `firma.de` | Nur diese Adressen dürfen sich registrieren; mehrere mit Komma (`firma.de,firma-gruppe.de`) |
| Name der Firma | `Firma GmbH` | Erscheint im Hinweis „Diese Instanz wird von … betrieben“ |
| Link zum Impressum | `https://www.firma.de/impressum` | Optional; leer = neutraler Hinweis |
| Link zur Datenschutzerklärung | `https://www.firma.de/datenschutz` | Optional; leer = neutraler Hinweis |
| SMTP-Server | `smtp.firma.de` | Postausgangsserver des Postfachs |
| SMTP-Port | `587` | 587 = STARTTLS (empfohlen), 465 = TLS (bei Hetzner anfangs gesperrt) |
| SMTP-Benutzer | `tickets@firma.de` | Meist die Postfach-Adresse |
| SMTP-Passwort | (verdeckt) | – |
| Absender | `inhouseticket <tickets@firma.de>` | Muss zum Postfach passen (sonst Spam) |
| Antworten gehen an | `len@firma.de` | Optional |

Danach:

1. erzeugt das Skript `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` und `INTEGRATION_SECRET` (je 32 Byte
   Zufall via `openssl rand`),
2. schreibt alles nach `/opt/inhouseticket/.env` (Rechte `600`),
3. lädt die Images und startet die drei Container,
4. wartet, bis die App gesund ist (Migrationen laufen beim ersten Start), und prüft `https://<Subdomain>`.

Erneutes Ausführen ist gefahrlos: gespeicherte Werte werden vorgeschlagen, **Geheimnisse nie neu erzeugt**,
die vorige Fassung bleibt als `.env.bak`. Einen optionalen Wert leeren oder einzelne Werte ändern geht
direkt in der Datei: `nano /opt/inhouseticket/.env`, danach `docker compose up -d`.

**Wichtig – jetzt erledigen:** Inhalt von `.env` in den Passwort-Manager legen:

```bash
cat /opt/inhouseticket/.env
```

Ohne `BETTER_AUTH_SECRET` und `INTEGRATION_SECRET` lässt sich ein Backup auf einem neuen Server zwar
einspielen, aber alle müssen sich neu anmelden und der ClickUp-Token muss neu eingetragen werden.

---

## 7 Starten und prüfen

`install.sh` hat schon gestartet. Prüfen:

```bash
cd /opt/inhouseticket
docker compose ps
```

Erwartet: `postgres` und `app` mit `(healthy)`, `caddy` mit `Up` und den Ports 80/443.

```bash
curl -fsS https://tickets.firma.de/api/health; echo
```

Erwartet: `{"status":"ok","database":"ok","version":"sha-…"}`.

Im Browser: <https://tickets.firma.de> öffnen →

- leitet auf `/login` weiter,
- Schloss-Symbol in der Adresszeile → Zertifikat von **Let's Encrypt**, gültig für `tickets.firma.de`,
- unten die Links „Impressum“ und „Datenschutz“ zeigen auf die Seiten der Firma.

Erreicht Caddy kein Zertifikat (Seite lädt nicht, Warnung im Browser): siehe [13 Fehlerbehebung](#13-fehlerbehebung).

Jetzt noch die **tägliche Sicherung** einschalten (Details in Schritt 12):

```bash
./backup.sh --install-timer
./backup.sh
```

---

## 8 Erster Login, Firmen-Workspace, Kollegen einladen

### 8.1 Konto anlegen

1. <https://tickets.firma.de/register> öffnen (oder auf der Anmeldeseite „Registrieren“).
2. Name, **deine Firmen-Adresse** (`len@firma.de`) und ein Passwort eingeben → absenden.
3. In der Mail „Bestätige deine Registrierung“ auf den Link klicken. Kommt keine Mail: Spam-Ordner,
   dann [13 Fehlerbehebung → Mails](#mails-kommen-nicht-an).
4. Du bist angemeldet und landest im Einrichtungs-Assistenten.

Regeln bei der Registrierung:

- Adressen der eingetragenen Firmen-Domain(s) dürfen sich registrieren.
- Andere Adressen nur mit offener Einladung (z. B. Freelancer mit eigener Firmen-Domain).
- Freemail (Gmail, GMX, Web.de, Outlook …) ist immer gesperrt – Ausnahme: Adressen in `SUPERADMIN_EMAILS`
  und `TESTER_EMAILS`.
- Anmeldelinks per Mail legen nie ein Konto an – neue Leute registrieren sich immer über `/register`
  oder ihren Einladungslink.

### 8.2 Workspace anlegen

Der Assistent schlägt einen Workspace mit dem Namen der Domain vor:

1. Name (z. B. `Firma`) und Farbe wählen.
2. **„Alle mit einer @firma.de-Adresse dürfen beitreten“** angehakt lassen – dann sehen Kolleginnen und
   Kollegen den Workspace nach ihrer Registrierung und treten mit einem Klick bei.
3. Team-Art, Ansicht, Einladungen: ausfüllen oder überspringen.

Du bist **Besitzer** des Workspace. Als Betreiber (`SUPERADMIN_EMAILS`) siehst du außerdem im Menü
oben rechts die „Betreiber-Übersicht“ (`/admin`: Version, Kennzahlen, erkannte IP).

### 8.3 Kollegen einladen

- Seitenleiste links → **Mitglieder** → Adressen eintragen (mehrere mit Komma) → Rolle wählen →
  Einladen. Jede Person bekommt eine Mail mit Link.
- Oder ohne Einladung: Kolleginnen und Kollegen registrieren sich selbst unter
  `https://tickets.firma.de/register` und treten dem Workspace bei (bei aktivem Domain-Beitritt).
- Wer Tickets aus ClickUp zugeordnet bekommen soll, sollte **vor dem ClickUp-Abgleich** Mitglied sein
  (die Zuordnung läuft über die E-Mail-Adresse; später lässt sie sich unter „Zuordnung ändern“ nachholen).

---

## 9 ClickUp verbinden und alles übernehmen

### 9.1 API-Token in ClickUp erzeugen

In ClickUp (mit einem Konto, das alle betroffenen Spaces sieht):

1. Auf deinen **Avatar** (je nach Ansicht unten links oder oben rechts) → **Einstellungen** (Settings).
2. Links **Apps** → Abschnitt **API-Token** → **Generieren** (bzw. „Generate“).
3. Token kopieren (beginnt mit `pk_`).

Der Token hat dieselben Leserechte wie dein ClickUp-Konto. inhouseticket liest nur – in ClickUp ändert
sich nichts.

### 9.2 In inhouseticket verbinden

Im Workspace: Seitenleiste links → **Integrationen** → bei **ClickUp** auf „Verbinden“
(Adresse: `https://tickets.firma.de/<workspace>/settings/integrations/clickup`, nur Admins/Besitzer).

1. **Token prüfen:** Token einfügen → „Token prüfen“. Er wird verschlüsselt gespeichert (mit
   `INTEGRATION_SECRET`) und nie wieder angezeigt. Erreicht der Token mehrere ClickUp-Workspaces, den
   richtigen wählen.
2. **Spaces & Listen:** Für einen kompletten Umzug jeden Space als **„Ganzer Space“** anhaken – dann kommen
   auch Listen mit, die später entstehen. Jeder Space wird ein Projekt; Ordner und Liste stehen als Labels
   am Ticket.
3. **Zuordnung:**
   - *Status:* Vorschlag nach Name und ClickUp-Typ prüfen. „Eigener Status“ legt den ClickUp-Status mit
     gleichem Namen im Projekt an.
   - *Personen:* per E-Mail-Adresse. Wer noch kein Mitglied ist, bleibt unzugewiesen – einladen und später
     unter „Zuordnung ändern“ nachholen.
   - *Priorität:* fest (Urgent → Dringend, High → Hoch, Normal → Mittel, Low → Niedrig).
4. **„Speichern und Abgleich starten“.**

### 9.3 Wie lange dauert der erste Abgleich?

ClickUp erlaubt rund 100 Anfragen pro Minute und Token; inhouseticket bleibt mit 90 darunter.

| Teil | ca. 17 000 Aufgaben |
|---|---|
| Aufgaben, Unteraufgaben, Hierarchie (100 Aufgaben je Anfrage) | 10–30 Minuten |
| Kommentare (eine Anfrage je Aufgabe, in 4-Minuten-Scheiben je Lauf) | 3–5 Stunden im Hintergrund |

- Die Seite zeigt im **Protokoll** jeden Lauf: gelesen · angelegt · geändert · Kommentare · Fehler.
- Der Abgleich läuft im Server weiter, auch wenn du den Browser schließt. Ein Neustart des Servers
  unterbricht ihn nur – der nächste Lauf macht an derselben Stelle weiter.
- Bis die Kommentare durch sind, setzt jeder automatische Lauf (alle 5 Minuten) sie fort.

### 9.4 Echtzeit (Webhooks)

Nach dem ersten erfolgreichen automatischen Lauf (spätestens nach ein paar Minuten) registriert
inhouseticket bei ClickUp einen Webhook auf `https://tickets.firma.de/api/integrations/clickup/webhook/…`.
In der Übersicht steht dann **Echtzeit: aktiv** – Änderungen in ClickUp kommen sofort herein, zur
Sicherheit wird zusätzlich alle 30 Minuten abgeglichen. Steht dort „gestört“ oder „nicht eingerichtet“,
wird alle 5 Minuten abgeglichen – funktioniert also trotzdem.

### 9.5 Parallelphase

Während der Parallelphase (z. B. 1–2 Wochen):

- **Alle arbeiten weiter in ClickUp.** inhouseticket liest nur (Einbahnstraße ClickUp → inhouseticket).
  Änderungen in ClickUp kommen per Webhook bzw. Delta-Abgleich herein.
- In inhouseticket schauen sich alle ihre Tickets an, richten Ansichten/Favoriten ein, testen.
  Änderungen an übernommenen Tickets in inhouseticket können vom nächsten Abgleich überschrieben werden,
  sobald dieselbe Aufgabe in ClickUp geändert wird.
- In ClickUp gelöschte Aufgaben werden nicht gelöscht, sondern bekommen das Label „In ClickUp gelöscht“.
- **Nicht übernommen** werden: Anhänge/Dateien aus ClickUp, Zeiterfassung und Schätzungen, Startdatum,
  weitere Zuständige außer dem ersten (als Beobachter gibt es sie nicht). Wichtige Anhänge vor dem Umstieg
  selbst sichern (siehe Schritt 10).

---

## 10 Umstieg und ClickUp abschalten

Checkliste für den Umstiegstag (vorher den Termin an alle kommunizieren):

1. **Stichtag ansagen:** Ab z. B. Montag 8:00 nur noch inhouseticket. Bis dahin letzte Änderungen in ClickUp.
2. **Letzter Abgleich:** Seitenleiste → Integrationen → ClickUp → **„Jetzt abgleichen“**. Warten, bis
   im Protokoll der Lauf nicht mehr „läuft“ zeigt und **0 Fehler** stehen. Noch einmal wiederholen – der
   zweite Lauf sollte `0 angelegt` melden.
3. **Stichproben:**
   - Anzahl: In ClickUp die Aufgaben je Space (Listenansicht, inkl. geschlossener) mit den Tickets je Projekt
     vergleichen (Tickets-Liste, Filter „Alle Status“).
   - 10–20 Aufgaben quer durch Spaces öffnen und vergleichen: Titel, Beschreibung, Status, Zuständige,
     Fälligkeit, Unteraufgaben, Checkliste, Kommentare.
   - Kommentare: Im Protokoll muss der letzte Lauf Kommentare abgeschlossen haben (keine weiteren
     Kommentar-Läufe mehr nötig, Zahl bleibt stabil).
4. **Anhänge sichern:** Was an Dateien aus ClickUp noch gebraucht wird, herunterladen und in inhouseticket
   an das passende Ticket hängen.
5. **Trennen:** Seitenleiste → Integrationen → ClickUp → **„ClickUp trennen“** → bestätigen. Token,
   Auswahl, Zuordnung und Protokoll werden gelöscht, der Webhook bei ClickUp entfernt – **alle Tickets
   bleiben** und gehören ab jetzt nur noch inhouseticket.
6. **Archiv aus ClickUp behalten:** In ClickUp als Admin Einstellungen → **Import/Export** → **Exportieren**,
   Format CSV (kommt per E-Mail). Datei zusammen mit den gesicherten Anhängen im Firmenlaufwerk ablegen.
7. **Token in ClickUp entwerten:** Avatar → Einstellungen → Apps → API-Token → **Neu generieren** (der alte
   wird damit ungültig).
8. **ClickUp kündigen** bzw. Konten herunterstufen – erst, wenn das Archiv geprüft ist.
9. **Sicherung:** `ssh root@<IPv4>` → `cd /opt/inhouseticket && ./backup.sh` – ein Stand direkt nach dem
   Umstieg.

---

## 11 Updates

Neue Versionen entstehen mit jedem grünen Commit auf `main` (Tag `main` = neueste, `sha-<commit>` = fest).

```bash
ssh root@<IPv4>
cd /opt/inhouseticket
./update.sh
```

Das Skript:

1. sichert die Datenbank (`backup.sh`),
2. lädt das neue Image,
3. erneuert `docker-compose.yml`, `Caddyfile` und die Skripte aus dem Image (`.env` bleibt unverändert),
4. setzt `IMAGE_TAG` in `.env` und startet neu – Migrationen laufen beim Start,
5. wartet auf `/api/health` und gibt die neue Version aus.

Bestimmte Version einspielen oder zurückgehen:

```bash
./update.sh sha-<40-stelliger Commit>
```

Zurück auf eine ältere Version nur, wenn das Update **keine** Datenbank-Migration enthielt – sonst
zuerst die Sicherung von eben einspielen (`./restore.sh …`, Schritt 12), dann `./update.sh <alter Tag>`.

Empfehlung: einmal im Monat updaten, außerhalb der Arbeitszeit (Ausfall ca. 10–30 Sekunden).
Ubuntu-Sicherheitsupdates laufen automatisch; Docker selbst kommt über `apt` mit
(`apt update && apt -y upgrade`, ab und zu von Hand).

Eigene Anpassungen (z. B. mehr Speicher für die App) nicht in `docker-compose.yml` schreiben – die Datei
wird bei jedem Update ersetzt –, sondern in `/opt/inhouseticket/docker-compose.override.yml`:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2g
```

---

## 12 Backups und Wiederherstellung

Zwei Ebenen:

| Ebene | Was | Wann | Aufbewahrung |
|---|---|---|---|
| `backup.sh` (systemd-Timer) | Datenbank-Dump (`pg_dump -Fc`) nach `/var/backups/inhouseticket` | täglich 03:30 | 14 Tage |
| Hetzner-Backups | Abbild des ganzen Servers (inkl. der Dumps) | täglich, Zeitfenster bei Hetzner | 7 Abbilder |

Timer einrichten (einmalig, schon in Schritt 7 erledigt) und prüfen:

```bash
cd /opt/inhouseticket
./backup.sh --install-timer
systemctl list-timers inhouseticket-backup.timer
ls -lh /var/backups/inhouseticket
```

Letzten Lauf ansehen: `journalctl -u inhouseticket-backup.service -n 20`.

### Kopie außer Haus (empfohlen, z. B. monatlich)

Auf dem Windows-PC in PowerShell:

```powershell
mkdir $env:USERPROFILE\inhouseticket-backups -Force
scp "root@<IPv4>:/var/backups/inhouseticket/*.dump" $env:USERPROFILE\inhouseticket-backups\
```

### Datenbank wiederherstellen

```bash
cd /opt/inhouseticket
ls -lh /var/backups/inhouseticket
./restore.sh /var/backups/inhouseticket/inhouseticket_<Datum>.dump
```

Das Skript prüft die Datei, fragt nach (`WIEDERHERSTELLEN` eintippen), sichert den aktuellen Stand,
stoppt die App, legt die Datenbank neu an, spielt den Dump ein und startet die App. Alle Änderungen nach
dem Zeitpunkt des Dumps sind danach weg.

### Ganzen Server wiederherstellen

- **Server kaputt, Hetzner-Backup vorhanden:** Cloud Console → Server → **Backups** → gewünschtes Backup →
  „Backup wiederherstellen“ (überschreibt den Server) oder „In neuen Server umwandeln“ (neue IP → DNS
  anpassen).
- **Neuer Server ohne Hetzner-Backup:** Schritte 1–5 auf dem neuen Server, dann die gesicherte `.env` aus
  dem Passwort-Manager nach `/opt/inhouseticket/.env` legen (`nano`, danach `chmod 600 .env`), Dump
  hochladen und einspielen:

  ```powershell
  scp $env:USERPROFILE\inhouseticket-backups\inhouseticket_<Datum>.dump root@<neue IPv4>:/root/
  ```

  ```bash
  cd /opt/inhouseticket
  docker compose up -d
  CONFIRM=WIEDERHERSTELLEN ./restore.sh /root/inhouseticket_<Datum>.dump
  ./backup.sh --install-timer
  ```

  DNS auf die neue IP umstellen (Schritt 2).

---

## 13 Fehlerbehebung

Alle Befehle auf dem Server in `/opt/inhouseticket`.

### Überblick und Logs

```bash
docker compose ps                         # läuft alles? (healthy)
docker compose logs --tail=100 app        # App-Fehler, Migrationen, Mails, ClickUp
docker compose logs --tail=100 caddy      # Zertifikat, Anfragen
docker compose logs -f app                # live mitlesen, Strg+C beendet
docker stats --no-stream                  # Speicher/CPU je Container
df -h /                                   # Platte voll?
```

Neu starten: `docker compose restart app` (nur App) oder `docker compose up -d` (alles nach `.env`-Änderung).

### Seite nicht erreichbar / Zertifikatswarnung

1. DNS prüfen (Schritt 2): zeigt `tickets.firma.de` auf die Server-IP – auch AAAA?
2. Hetzner-Firewall: Port 80 **und** 443 offen und dem Server zugewiesen?
3. `docker compose logs caddy | grep -i -E "error|challenge|acme"`:
   - `NXDOMAIN` / `no valid A records` → DNS noch nicht verbreitet, warten.
   - `Timeout during connect` → Port 80 zu oder AAAA zeigt woanders hin.
   - `too many certificates` / `rateLimited` → Let's-Encrypt-Limit; eine Stunde warten, nicht ständig
     neu starten. Das Volume `caddy_data` nie löschen (dort liegen die Zertifikate).
4. Danach `docker compose restart caddy`.

### 502 Bad Gateway

Caddy läuft, die App antwortet nicht.

- `docker compose ps` → `app` „restarting“ oder „unhealthy“? → `docker compose logs --tail=100 app`.
- `Invalid environment variables` → Tippfehler in `.env` (z. B. Impressum-URL ohne `https://`); korrigieren,
  `docker compose up -d`.
- Fehler bei `migrate` → Datenbank nicht erreichbar oder Migration fehlgeschlagen: `docker compose logs postgres`;
  nach einem fehlgeschlagenen Update die Sicherung von vorher einspielen und alten Tag starten (Schritt 11).
- `OOMKilled` (in `docker inspect $(docker compose ps -q app) --format '{{.State.OOMKilled}}'`) → mehr
  Speicher per `docker-compose.override.yml` (Schritt 11) oder größerer Server.
- Kurz nach dem Start ist ein 502 normal (Migrationen) – 30 Sekunden warten.

### Mails kommen nicht an

1. `docker compose logs app | grep -i -E "mail|smtp"` – die App protokolliert Fehlversuche.
2. Port prüfen – vom Server aus:

   ```bash
   timeout 5 bash -c '</dev/tcp/smtp.firma.de/587' && echo "Port 587 erreichbar"
   ```

   Kein „erreichbar“ → Port gesperrt. Hetzner sperrt bei neuen Konten **25 und 465**; 587 nehmen.
   (Freigabe von 465 kann man nach der ersten bezahlten Rechnung bei Hetzner beantragen.)
3. `SMTP_USER`/`SMTP_PASSWORD` stimmen? `MAIL_FROM` muss eine Adresse sein, die das Postfach senden darf.
4. Werte in `.env` korrigieren → `docker compose up -d`.
5. Mails landen im Spam → beim Mail-Anbieter SPF/DKIM für die Domain prüfen (meist schon eingerichtet,
   wenn das Postfach beim selben Anbieter liegt).

### „Anmelden können nur Personen mit einer Adresse eurer Firma …“

Die Adresse gehört zu keiner Domain in `BETA_ALLOWED_DOMAINS` und hat keine offene Einladung. Person
einladen (Mitglieder) oder die Domain in `.env` ergänzen → `docker compose up -d`.

### ClickUp-Abgleich hängt oder meldet Fehler

- Integrationen → ClickUp: Status und **Protokoll** ansehen.
- „Token abgelehnt“ → in ClickUp neuen Token erzeugen → „Token ersetzen“.
- „zu viele Anfragen“ → nichts tun, der nächste Lauf macht weiter.
- „Integrationen sind auf diesem Server noch nicht eingerichtet“ → `INTEGRATION_SECRET` fehlt in `.env`
  (`./install.sh` erneut ausführen, er ergänzt fehlende Geheimnisse).
- „Der gespeicherte Token ist nicht mehr lesbar“ → `INTEGRATION_SECRET` wurde geändert; alten Wert aus
  dem Passwort-Manager zurück oder Token neu eintragen.
- `docker compose logs app | grep "integration sync"` zeigt Details.

### Update schlägt fehl: `denied` / `unauthorized` beim Laden

GitHub-Token abgelaufen. Neuen Token anlegen (Schritt 5.1) und neu anmelden (Schritt 5.2), dann `./update.sh`.
