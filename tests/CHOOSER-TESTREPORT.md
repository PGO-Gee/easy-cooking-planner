# Gerichtsauswahl im Wochenplan

Geprüft am 16. November 2026 mit lokalem Headless Chromium und Touch-Unterstützung.

- Viewports: 320 × 568, 390 × 844, 844 × 390, 1440 × 900, 390 × 360 und 320 × 280 CSS-Pixel.
- Jeweils Light und Dark sowie `prefers-reduced-motion: reduce`.
- Geprüft: Öffnen ohne Suchfokus, Filtern nach Namen, keine Treffer, sichtbarer erster Treffer, scrollbare Liste bei Platzmangel, kein horizontaler Überlauf, „Fertig“ mit erhaltenem Suchtext, Eintragen eines Gerichts und Eintragen eines Restetags.
- Screenshots der normalen und höhenreduzierten Suche in beiden Themes visuell geprüft.
- 213 bestehende Node-Tests erfolgreich; Asset-Tests nach Cache-Aktualisierung erneut erfolgreich.

Die reduzierten Höhen simulieren den verfügbaren Platz bei geöffneter Tastatur. Eine Liveprüfung auf einem iPhone mit Safari und echter iOS-Tastatur fand nicht statt.

Reproduzierbarer Browser-Test: `tests/chooser-browser.cjs`. Optional `WOCHENTISCH_PLAYWRIGHT_MODULE`, `WOCHENTISCH_BROWSER_EXECUTABLE` und `WOCHENTISCH_UI_OUTPUT` setzen.
