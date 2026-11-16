# Direktes Verschieben im Wochenplan

Die zusätzliche Vollbild-Tagesauswahl entfällt. Nach 500 ms Halten lässt sich ein Gericht direkt auf die vorhandenen Tageszeilen ziehen. Der Zieltag erhält einen Rahmen; am oberen und unteren sichtbaren Rand scrollt der Plan automatisch. Stillhalten und normale Wischgesten starten kein automatisches Scrollen. Fixierungen und das Rückgängigmachen bleiben erhalten.

Geprüft mit lokalem Chromium und emulierten Touch-Ereignissen:

- 320 × 568, 390 × 844, 844 × 390, 390 × 340 und 1440 × 900, jeweils Light und Dark.
- Reduzierte Bewegung für die gesamte Matrix; normale Bewegung beim Anheben und Abbrechen bei 390 × 844 in beiden Themes.
- Scrollgeste vor der Halteschwelle, Halten ohne Bewegung, Abbruch, Ablage auf der Datumsspalte eines freien Tages, automatisches Scrollen zum letzten Tag, Fixierung, Rückgängig und Mausverschieben am Desktop.
- Keine horizontalen Überläufe und keine JavaScript-Laufzeitfehler in diesen Prüfungen.
- 229 Node-Tests erfolgreich.

390 × 340 simuliert einen verkleinerten sichtbaren Bereich. Eine echte iOS-Tastatur, iPhone-Hardware und Safari wurden nicht live geprüft.

Reproduktion: `node --test tests/*.test.cjs` und `node tests/week-drag-browser.cjs` (Playwright mit installiertem Chromium; optional `WOCHENTISCH_PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH` und `WOCHENTISCH_UI_OUTPUT`).
