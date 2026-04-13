# Deployment — Vercel + optional Supabase

Dieses Dokument zeigt, wie du den AoE2-PWA-Klon auf **Vercel** ausrollst
und optional ein **Supabase-Projekt** für Cloud-Replay-Backup anbindest.

> **Wichtig:** Das Spiel läuft vollständig offline. Supabase ist *optional*
> — ohne die Env-Variablen bleibt das Spiel eine reine PWA ohne Backend.
> Wenn dir lokale IndexedDB-Speicherung reicht, kannst du Schritt 2
> komplett überspringen.

---

## Schritt 1 — Vercel-Deployment (5 Minuten)

Voraussetzung: Du hast einen Vercel-Account (kostenlos, https://vercel.com/signup).
Der Branch `claude/aoe-pwa-game-dH8dy` ist auf GitHub gepusht.

### 1.1 Projekt importieren

1. Öffne https://vercel.com/new
2. Klicke **"Import Git Repository"**
3. Wähle `Icarus-health/AOE` (ggf. Vercel-GitHub-App installieren / Repo-Zugriff erlauben)
4. Klicke **"Import"**

### 1.2 Build-Settings

Vercel erkennt Vite automatisch. Die Felder sollten vorausgefüllt sein:

| Feld                | Wert                |
|---------------------|---------------------|
| **Framework Preset**| Vite                |
| **Build Command**   | `npm run build`     |
| **Output Directory**| `dist`              |
| **Install Command** | `npm install`       |
| **Root Directory**  | `./` (leer lassen)  |

Die Datei `vercel.json` im Repo setzt Caching-Header für `gfx.bin`, den
Service Worker und alle Assets — nichts manuell zu tun.

### 1.3 Production Branch

**WICHTIG**: Standardmäßig deployed Vercel vom `main`-Branch. Unser
aktiver Entwicklungs-Branch ist aber `claude/aoe-pwa-game-dH8dy`.

In den Projekt-Settings nach dem Import:

1. **Settings → Git → Production Branch** → setze auf
   `claude/aoe-pwa-game-dH8dy`
2. Oder: mergen von `claude/aoe-pwa-game-dH8dy` → `main` (dann bleibt
   Production auf main und Preview-Deploys entstehen automatisch pro
   Feature-Branch).

### 1.4 Deploy

Klicke **"Deploy"**. Der erste Build dauert ~60 Sekunden. Du bekommst eine
URL wie `https://aoe-xxx.vercel.app`. Fertig — PWA installierbar, offline-fähig.

### 1.5 Eigene Domain (optional)

**Settings → Domains → Add** und deinen Domain-Namen eintragen. Vercel
führt dich durch DNS-Einträge (CNAME oder A-Record).

---

## Schritt 2 — Supabase für Cloud-Replay-Backup (optional, 10 Minuten)

Wenn du willst, dass Replays auch dann überleben, wenn der Browser-Cache
gelöscht wird oder dein Spieler auf ein anderes Gerät wechselt, nimm
Supabase dazu. Für einen Hobby-Einsatz reicht der **Free Tier**: 500 MB
Storage + 50 000 monatliche Requests.

### 2.1 Supabase-Projekt erstellen

1. https://supabase.com/dashboard/sign-up
2. **"New Project"**
3. Felder:
   - **Organization**: deine (default reicht)
   - **Name**: `aoe-pwa`
   - **Database Password**: generiere einen starken (speichere ihn im Passwort-Manager — du brauchst ihn selten, nur für direktes SQL)
   - **Region**: wähle eine Region nahe bei deinen Spielern (Frankfurt, wenn DE)
   - **Plan**: Free
4. Klicke **"Create new project"** — dauert ~2 Minuten

### 2.2 Storage-Bucket anlegen

1. In der linken Sidebar: **Storage**
2. Klicke **"New bucket"**
3. **Name**: `aoe-replays`
4. **Public bucket**: ✅ **anhaken** (damit das PWA-Client-JS ohne Auth
   lesen/schreiben kann — Absicherung läuft über das RLS-Policy unten)
5. Klicke **"Create bucket"**

### 2.3 Bucket-Policies (RLS)

Damit *jeder Browser* Replays unter seiner eigenen `device_id`
hochladen darf, brauchst du zwei Policies. Öffne:

**Storage → aoe-replays → Configuration → Policies → New Policy → For full customization**

Dann kopiere je eine der beiden Policies rein. Die Device-ID-Prüfung
passiert aktuell NUR auf dem Client (die anonyme Schlüsselung ist durch
Supabase-Anon-Key gegeben, nicht durch Authentifizierung). Das ist OK für
ein Hobby-Projekt — für Production würde man echte Supabase-Auth
hinzufügen (Roadmap Phase 6).

**Policy 1: Anyone can upload**
```sql
CREATE POLICY "public upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'aoe-replays');
```

**Policy 2: Anyone can read**
```sql
CREATE POLICY "public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'aoe-replays');
```

**Policy 3: Anyone can delete (optional)**
```sql
CREATE POLICY "public delete"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'aoe-replays');
```

Paste die SQL in **SQL Editor → New Query → Run**.

### 2.4 API-Keys holen

1. **Project Settings → API** (Zahnrad-Icon unten links → API)
2. Kopiere diese beiden Werte:
   - **Project URL** → sieht aus wie `https://abcdxxx.supabase.co`
   - **Project API keys → `anon` `public`** → langer JWT-String

> Der `anon`-Key ist designed, öffentlich im Browser zu laufen. Der
> `service_role`-Key darunter darf NIEMALS in Client-Code landen.

### 2.5 Env-Vars in Vercel setzen

Zurück bei Vercel:

1. **Deinem AoE-Projekt → Settings → Environment Variables**
2. Füge diese zwei Variablen hinzu:

| Name                    | Wert                           | Environments              |
|-------------------------|--------------------------------|---------------------------|
| `VITE_SUPABASE_URL`     | `https://abcdxxx.supabase.co`  | Production, Preview, Dev  |
| `VITE_SUPABASE_ANON_KEY`| `eyJhbGciOi…` (der lange JWT)  | Production, Preview, Dev  |

3. Klicke **"Save"**

### 2.6 Redeploy auslösen

Vercel baut env-vars nur beim Build in den Client ein. Nach dem Setzen
einmal:

**Deployments → jüngster Build → ⋯ → Redeploy**

Nach dem Redeploy speichert `saveReplay()` automatisch parallel zu
IndexedDB auch ins Supabase-Bucket. Lösche mal absichtlich den Browser-
Cache und rufe einen gespeicherten Replay wieder auf — er wird vom
Cloud geladen.

### 2.7 Lokal entwickeln mit Supabase

Wenn du die Cloud-Features auch lokal (`npm run dev`) testen willst:

```bash
# .env.local im Projekt-Root (wird durch .gitignore geschützt)
VITE_SUPABASE_URL=https://abcdxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi…
```

Vite lädt `.env.local` automatisch.

---

## Troubleshooting

### Build auf Vercel schlägt fehl mit "Python not found"

Der Sprite-Bundle-Step (`npm run bundle-images`) braucht Python 3. Wir
committen `public/gfx.bin` und `public/gfx.json` direkt im Repo, damit
das **nicht** auf Vercel laufen muss. Wenn du die Sprites geändert hast,
musst du lokal einmal `npm run bundle-images` laufen lassen und die
aktualisierten Binaries committen — **nicht** auf Vercel generieren.

### PWA-Update wird nicht gezeigt

Der Service Worker cached aggressiv. Nach einem neuen Deploy:
- **Harter Reload** (Ctrl+Shift+R / Cmd+Shift+R)
- Oder Browser-Devtools → **Application → Service Workers → Unregister** → Reload

### Replay-Upload schlägt mit 400/403 fehl

Meistens ein RLS-Policy-Problem. Prüfe:
- Bucket ist **public**
- Die drei Policies aus 2.3 existieren und sind aktiv
- In der Browser-Devtools-Console sollte beim Speichern eines Replays
  `[cloud] replay backup failed: …` stehen mit der genauen Fehlermeldung

### Env-Vars kommen nicht im Client an

Vite bundled env vars NUR beim Build. Nach einer Env-Var-Änderung musst
du **redeployen** (nicht nur den Browser-Cache leeren).

### Cloud-Feature prüfen ohne Spiel zu starten

In der Browser-Devtools-Console:
```js
import('/src/cloud/supabase_client.js').then((m) => console.log(m.cloudStatus()))
```
Muss `{ enabled: true, url: "https://...", deviceId: "dev-…" }` zeigen.

---

## Was du NICHT brauchst

- **Vercel Pro** — der Free-Tier reicht bis ~100 GB Bandbreite/Monat.
- **Supabase Pro** — Free-Tier reicht für >500 Replays / Monat.
- **Eigenen Backend-Server** — das Spiel ist reine Client-Side + optionaler
  Supabase-Storage-Upload.
- **Eine Datenbank-Tabelle** — der Replay-Backup nutzt Supabase Storage
  (S3-kompatibler Object-Store), kein SQL-Schema notwendig.
