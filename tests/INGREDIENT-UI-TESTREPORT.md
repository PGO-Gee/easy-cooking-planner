# Zutatenvorschläge – UI-Prüfung, 15. November 2026

## Änderung

- Gemeinsame Darstellung für Vorräte, Rezeptzutaten, Rezeptkategorie und Einkauf: 48 px Mindesthöhe, umbrechende Namen, markierter Suchtext und Theme-Farben.
- Vorschläge in Dialogen erscheinen im Dokumentfluss unter der Eingabe. Die Listen sind separat scrollbar, ohne andere Formularfelder zu überdecken.
- Einkaufsvorschläge wählen anhand des Visual Viewports den verfügbaren Platz über oder unter dem Feld.
- Pfeiltasten, Enter und Escape für die bisher unterschiedlich bedienten statischen Eingabefelder; Fokuswechsel schließt deren Liste. Die bestehende Tastaturbedienung der Rezeptzeilen bleibt erhalten.
- Hilfetext zur Herkunft der Vorratsvorschläge korrigiert. Offline-Shell auf Version 126 erhöht.

## Tatsächlich geprüft

Lokales Chromium Headless, isolierte Rezept-Testdaten, externe Netzwerkanfragen blockiert.

- Bestehende Viewport-Matrix: 126 Prüfungen für Wochenplan, Gerichte, Zubereiten, Rezeptansicht, Kochschritte, Einkauf und Editor. Breiten/Höhen: 320×568, 390×844, 393×852, 430×932, 844×390, 852×393, 1024×768, 1280×800, 1440×900. Jeweils Light/Dark, `prefers-reduced-motion: reduce`. Keine horizontalen Überläufe oder seitlich außerhalb des Viewports liegenden Bedienelemente.
- Zusätzlicher Browser-Test `ingredient-suggestions-browser.cjs`: 320×568, 390×844, 844×390, 390×340 und 1440×900, jeweils Light/Dark und reduzierte Bewegung. Vorratsauswahl und Einkaufsartikel per Pfeiltaste/Enter, Escape ohne Schließen des Vorratsdialogs, Hervorhebung der Eingabe, Rezeptzutaten-Auswahl und keine horizontalen Seitenüberläufe.
- Screenshots der Vorschläge erzeugt; Rezepteditor bei 320×568 Light und 390×844 Dark sowie Vorratsdialog bei 390×340 Dark visuell kontrolliert.
- Alle 177 vorhandenen Node-Tests erfolgreich; JavaScript-Syntax und `git diff --check` erfolgreich.

## Grenzen

390×340 simuliert eine geringe verfügbare Höhe. Keine Prüfung mit echter iOS-Tastatur, Safari, physischem iPhone, VoiceOver oder Touch-Scrollgesten. Die Chromium-Prüfung ersetzt diese Geräteprüfung nicht.

Browser-Test starten: `node tests/ingredient-suggestions-browser.cjs`. Falls erforderlich, `WOCHENTISCH_PLAYWRIGHT_MODULE` und `PLAYWRIGHT_BROWSERS_PATH` auf die lokale Playwright-Installation setzen. Screenshots landen in `.ui-check/` (oder `WOCHENTISCH_UI_OUTPUT`).
