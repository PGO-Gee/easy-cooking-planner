# Gerichtsauswahl im Wochenplan

Geprüft am 16. November 2026 mit lokalem Headless Chromium und Touch-Unterstützung.

- Viewports: 320 × 568, 390 × 844, 844 × 390, 1440 × 900, 390 × 360 und 320 × 280 CSS-Pixel.
- Jeweils Light und Dark sowie `prefers-reduced-motion: reduce`.
- Geprüft: Öffnen ohne Suchfokus, Filtern nach Namen, keine Treffer, sichtbarer erster Treffer, scrollbare Liste bei Platzmangel, kein horizontaler Überlauf, „Fertig“ mit erhaltenem Suchtext, Eintragen eines Gerichts und Eintragen eines Restetags.
- Screenshots der normalen und höhenreduzierten Suche in beiden Themes visuell geprüft.
- 213 bestehende Node-Tests erfolgreich; Asset-Tests nach Cache-Aktualisierung erneut erfolgreich.

Die reduzierten Höhen simulieren den verfügbaren Platz bei geöffneter Tastatur. Eine Liveprüfung auf einem iPhone mit Safari und echter iOS-Tastatur fand nicht statt.

Reproduzierbarer Browser-Test: `tests/chooser-browser.cjs`. Optional `WOCHENTISCH_PLAYWRIGHT_MODULE`, `WOCHENTISCH_BROWSER_EXECUTABLE` und `WOCHENTISCH_UI_OUTPUT` setzen.

## Zufallsgericht und Probegericht

Geprüft am 18. November 2026 mit Headless Chromium und Playwright-WebKit unter Windows.

- Je Engine acht Ansichts- und Theme-Kombinationen bei 320 × 568, 390 × 844, 844 × 390 und 1440 × 900 CSS-Pixeln, jeweils in Light und Dark mit reduzierter Bewegung. Die Tastatur wurde über einen verkleinerten Visual Viewport simuliert. Formularfelder, Dialoggrenzen, Scrollbarkeit und Touch-Ziele wurden geprüft.
- Geprüft wurden direktes Würfeln mit Haushaltsportionen, eine leere Sammlung, bereits verplante Gerichte und ein verknüpfter Restetag. Für Probegerichte wurden Titel allein, strukturierter und korrigierter Import, fehlgeschlagene Erkennung mit erhaltenem Text, Einkaufsliste, Zubereitung, Entfernen, Rückgängig und Übernahme aus einer vergangenen Woche geprüft.
- Der Offline-Neustart lud die App über den Service Worker und den gespeicherten Eintrag aus IndexedDB. Chromium war dabei im Offline-Modus. Für WebKit wurde der Zugriff auf den lokalen Testserver gesperrt und der Offline-Status simuliert.
- 246 Node-Tests und der isolierte PostgreSQL-Test waren erfolgreich. Der SQL-Test prüfte das Lesen durch ein zweites Haushaltsmitglied, ältere Sync-Payloads und die Übernahme mit stabiler Planreferenz.

Eine Liveprüfung auf einem iPhone mit Safari und echter iOS-Tastatur oder mit zwei Geräten im produktiven Haushalt steht aus.

Reproduzierbar mit `node tests/trial-dishes-browser.cjs`. Für WebKit `WOCHENTISCH_BROWSER_ENGINE=webkit` setzen. Die SQL-Prüfung läuft mit `node tools/test-cooking-sync.cjs` und einer lokalen PGlite-Installation.
