# Kochmenge ändern – iPhone-Layout

Geprüft am 16. November 2026 mit Headless Chromium und Touch-Unterstützung.

- 320 × 568, 390 × 844, 844 × 390, 1440 × 900, 390 × 360 und 320 × 280 CSS-Pixel, jeweils Light und Dark mit reduzierter Bewegung.
- Öffnen ohne automatischen Eingabefokus; Portionsfeld direkt sichtbar, mindestens 16 px Schrift und kein horizontaler Überlauf.
- Fokus und Eingabe, weitere Einstellungen öffnen/schließen, speichern und zur Gerichtsauswahl zurückkehren.
- Zusätzlich bei unverändertem Layout-Viewport (390 × 844): Visual Viewport auf 340 px Höhe und 70 px Versatz simuliert. Aktives Portionsfeld bleibt im sichtbaren Bereich. Screenshots in beiden Themes visuell geprüft.
- Alle 213 bestehenden Node-Tests erfolgreich; Asset-Tests nach Cache-Aktualisierung erneut erfolgreich.

Eine Liveprüfung auf einem iPhone mit Safari und echter iOS-Tastatur fand nicht statt. Die Simulation prüft die Layout- und Scrollreaktion auf veränderte Visual-Viewport-Werte.

Browser-Test: `tests/quantity-editor-browser.cjs`; optional `WOCHENTISCH_PLAYWRIGHT_MODULE`, `WOCHENTISCH_BROWSER_EXECUTABLE` und `WOCHENTISCH_UI_OUTPUT` setzen.
