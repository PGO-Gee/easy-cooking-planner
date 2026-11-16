# Gerichteseiten – Prüfung vom 15. November 2026

Die Sammlung zeigt höchstens 12 Gerichte pro Seite. Vor-/Zurück-Buttons stehen vor und nach der Galerie; horizontale Wischgesten auf der Galerie wechseln die Seite. Ein Seitenwechsel scrollt zum Anfang der Seitennavigation. Suche und Rezeptart filtern vor der Seitenauswahl und setzen auf Seite 1 zurück. Der aktuelle Datenabgleich lädt weiterhin die gesamte Sammlung; reduziert werden DOM-Karten und Bildanforderungen für die Galerie.

## Tatsächlich geprüft

Isolierter Chromium-Test mit 121 Gerichten und einem Backrezept, ohne Cloudzugriffe:

- 320 × 568, 390 × 844, 844 × 390 (Querformat), 390 × 340 (verkleinerter sichtbarer Bereich als Tastatur-Näherung) und 1440 × 900 CSS-Pixel.
- Alle Größen in Light- und Dark-Theme mit `prefers-reduced-motion: reduce`.
- Höchstens 12 Karten/Bildelemente; letzte Seite mit einem Eintrag; deaktivierte Randnavigation; kein horizontaler Überlauf; Navigationsbuttons mindestens 44 × 44 px.
- Vor-/Zurückblättern, untere Navigation mit Rückkehr zum Listenanfang, horizontale und vertikale synthetische Touch-Gesten sowie Unterdrückung eines Kartenklicks nach dem Wischen.
- Zusätzlich browserseitige Chromium-Touch-Eingaben für Rechts-nach-links-Wischen bei 390 × 844.
- Suche findet einen Treffer außerhalb der ursprünglich sichtbaren Seite; leere Trefferliste; Rezeptartwechsel; verkleinerte Sammlung und Haushaltswechsel.
- Screenshots erstellt; 320 × 568 Light und 1440 × 900 Dark visuell geprüft.
- Alle 211 vorhandenen Node-Tests bestanden; `git diff --check` ohne Fehler.

Keine Liveprüfung auf einem iPhone, in Safari oder mit echter iOS-Tastatur. Die Laufzeit des Cloudabgleichs wurde nicht gemessen.

## Wiederholen

`node tests/dishes-pagination-browser.cjs` mit installiertem Playwright und Chromium. Optional `WOCHENTISCH_PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH`, `WOCHENTISCH_BROWSER_EXECUTABLE` und `WOCHENTISCH_UI_OUTPUT` setzen. Screenshots liegen standardmäßig unter `.ui-check/`.
