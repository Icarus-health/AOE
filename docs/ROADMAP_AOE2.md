# Roadmap: AoE1 → AoE2 Modernisierung

Dieses Dokument beschreibt den Entwicklungsplan, um den aktuellen
`epoch-of-emperors` Fork (ein AoE 1 Klon mit antikem Setting) Schritt
für Schritt an **Age of Empires 2: Definitive Edition** anzunähern —
mit nostalgischem Gameplay, modernem UI/Grafik-Stack und Mobile/PWA-
Unterstützung.

Die Roadmap ist bewusst in **kleine, einzeln lieferbare Phasen**
zerlegt, weil das Gesamtprojekt sonst Monate dauert und nie spielbar
zwischendurch wäre.

## Designprinzipien

1. **Determinismus zuerst.** Jede Mechanik geht durch die seeded RNG.
   Lockstep-Multiplayer darf nie kaputt gehen — `tests/determinism.test.js`
   ist Pflichtprüfung.
2. **Datengetrieben.** Civs, Einheiten, Tech-Tree und Boni leben in
   reinen Datendateien (`src/engine/civilizations.js`,
   `src/engine/data/`), damit Balancing ohne Engine-Refactor läuft.
3. **Renderer-Abstraktion.** Der bestehende Canvas-Renderer und der
   neue WebGL-Renderer (PixiJS) sitzen hinter einem gemeinsamen
   Interface (`src/graphics/renderer.js`). Feature-Flag in Settings
   schaltet zwischen den beiden um — kein Big-Bang.
4. **Single-Player Polish first.** Multiplayer-Code bleibt erhalten,
   aber der Fokus liegt zuerst auf SP/Skirmish, weil dort die meisten
   AoE2-Spieler einsteigen.
5. **Mobile als First-Class.** Touch-Input ist nicht nur Adapter,
   sondern eigene UI-Schicht (Action Wheel, Long-Press-Menüs).

---

## Phase 1 — Foundation Re-Theme (in Arbeit)

Ziel: Das Spiel fühlt sich beim ersten Klick im Hauptmenü schon nach
Mittelalter an, ohne dass eine einzige Sprite-Datei ausgetauscht wurde.

- [x] Roadmap dokumentiert (`docs/ROADMAP_AOE2.md`)
- [ ] Civilization-Set auf 8 AoE2-Civs erweitert (Britons, Franks,
      Byzantines, Goths, Saracens, Vikings, Teutons, Mongols) mit
      Bonus-Tabellen
- [ ] AoE2 QoL-Mechaniken (Auto-Reseed Farm, Loom, Wheelbarrow,
      Hand Cart) als Tech-Tree-Einträge im Town Center
- [ ] Renderer-Abstraktion `src/graphics/renderer.js` mit `CanvasRenderer`
      als Default und `PixiRenderer` als experimentelle Option
- [ ] Mobile Action Wheel `src/ui/action_wheel.js` (Long-Press öffnet
      Radial Menu) — als Modul, integriert hinter Feature-Flag
- [ ] Phase 1 Determinism Test: Civ-Bonuses & Auto-Reseed reproduzierbar

## Phase 2 — Eco & QoL Parity

Ziel: Eco-Loop fühlt sich an wie AoE2.

- [ ] Auto-Scout für Scout-Einheit (erkundet Karte autonom)
- [ ] Garrison Heal in Town Center / Burg
- [ ] Build Queue für Gebäude (Gebäude-Slots wie in AoE2:DE)
- [ ] Tech-Tree-UI als overlay (statt einzelne Buttons im Gebäude)
- [ ] Gather-Boni durch Eco-Techs (Double-Bit Axe, Bow Saw, Two-Man Saw,
      Gold Mining → Gold Shaft Mining, etc.)

## Phase 3 — Combat Parity

- [ ] Konvertierung durch Mönche (Faith-Ressource, Relic-Carry)
- [ ] Pikenier / Halberdier (Cavalry-Counter)
- [ ] Hand Cannoneer (Late-Game Gunpowder)
- [ ] Trebuchet (Belagerung)
- [ ] Burg/Castle als Gebäude mit Unique-Unit-Slot

## Phase 4 — Renderer Migration

- [ ] PixiJS als Standard-Renderer aktivieren
- [ ] Sprite-Atlas zu Pixi-Texture-Atlas konvertieren
- [ ] WebGL-Beleuchtung für Day/Night
- [ ] Partikel: Pfeile, Rauch, Konvertierungs-FX
- [ ] Optional: 3D-Höhenkarte (Three.js) als zweite Renderer-Option

## Phase 5 — Content & Civs

- [ ] Mittelalter-Sprites (AI-generiert oder Open-Source-Pack)
- [ ] Restliche AoE2-Civs (13+ Civs total)
- [ ] Unique Units pro Civ (Longbowman, Throwing Axeman, …)
- [ ] Wonder pro Civ (alternative Siegbedingung)
- [ ] Tech-Tree Civ-spezifische Sperren

## Phase 6 — Single-Player Inhalte

- [ ] Random Map Skirmish (verschiedene Map-Typen: Arabia, Black Forest,
      Islands, Arena)
- [ ] AI-Persönlichkeiten verfeinern (per Civ)
- [ ] Einsteiger-Kampagne (William Wallace Style: 5 Missionen)
- [ ] Achievements / Match-Statistiken

## Phase 7 — Mobile Polish

- [ ] Native PWA-Install-Flow für iOS/Android getestet
- [ ] Touch-First UI Variante (kein Hotkey-Hint)
- [ ] Game-Speed Slider für Touch-Spieler (langsamere Default-Speed)
- [ ] Cloud Save (optional) per IndexedDB + WebRTC-Sync

---

## Was NICHT in dieser Roadmap steht (bewusst)

- Original-AoE2-Assets — urheberrechtlich nicht möglich.
- Microsoft-Account-Anbindung — DRM-frei, lokal-zuerst.
- Mod-Loader / Workshop — kann nach Phase 5 evaluiert werden.

## Aktueller Stand

Branch: `claude/aoe-pwa-game-dH8dy`

Phase 1 wird aktuell entwickelt. Jede abgeschlossene Phase erhält
einen eigenen Tag im Repo (`v0.1-foundation`, `v0.2-eco-parity`, …).
