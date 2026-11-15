# Ausgewählte Desktop-Referenz · Wochenliste

**Am 14. November 2026 ausgewählt: Wochenliste mit Gerichtsvorschau.** Dieser Stand ist die maßgebliche Desktop-Vorlage für den Wochenplan. Er beschreibt das Zielbild; die produktive App ist noch nicht umgestellt.

## Einstieg

- **[Ausgewählte Desktop-Vorschau öffnen](preview.html)** – lokal und ohne Internet nutzbar, ausschließlich die Wochenliste, mit Hell/Dunkel-Umschaltung.
- **[Styleguide](../../../STYLEGUIDE.md)** – inklusive abgestimmter Desktop-Regeln.
- [Mobile Referenzen](../2026-11-14/README.md) – weiterhin gültig und unverändert.
- [Früherer Desktop-Vergleich](../2026-11-14-desktop-drafts/README.md) – dokumentiert beide ursprünglichen Vorschläge. Das Wochenraster wurde nicht ausgewählt.

## Festgelegte Gestaltung

- Links eine schmale Seitenleiste mit Wochenplan, Gerichte, Zubereiten und Einkauf; Profil und Einstellungen unten.
- Header mit „Wochenplan“, Zeitraum und einem beschrifteten **Planen**-Button. Kein zusätzlicher Marken-Header oder Spruch.
- Im Hauptbereich links alle sieben Tage, rechts die Vorschau des ausgewählten Tages. Anfangs ist Montag ausgewählt.
- Geplante Gerichte erhalten kleine Fotos in der Liste; rechts erscheinen großes Foto, Dauer, Portionen und Zutaten.
- Freie Tage und Resteabende bleiben kompakte Zeilen. Resteabend ist grün; „Nicht geplant“ bleibt neutral und bietet die Gerichtsauswahl.
- „Rezept ansehen“ öffnet die vollständige Zubereitung. Die Vorratsauswahl liegt innerhalb von **7 Tage mischen**.
- Comic Relief, Farbrollen und Hell/Dunkel entsprechen dem Styleguide.

Beispieldaten: Montag Bolognese, Dienstag Tofu-Curry, Mittwoch Resteabend, Donnerstag Lachs, Freitag und Samstag nicht geplant, Sonntag Kartoffelgratin. Änderungen in der Vorschau werden nicht in der App gespeichert und sind nach Neuladen zurückgesetzt. Andere Screens in der Seitenleiste zeigen vorerst nur den Zugang.

## Screenshots

Die PNGs erfassen den vollständigen App-Inhalt bei der angegebenen Browsergröße, ohne die Bedienelemente der Vorschau darüber. Die Menü- und Auswahlzustände wurden bei 1440 × 900 px aufgenommen.

| Ansicht / Zustand | Hell | Dunkel |
| --- | --- | --- |
| Wochenliste · 1440 × 900 | [PNG](screenshots/light/01-wochenliste-1440.png) | [PNG](screenshots/dark/01-wochenliste-1440.png) |
| Wochenliste · 1280 × 800 | [PNG](screenshots/light/01-wochenliste-1280.png) | [PNG](screenshots/dark/01-wochenliste-1280.png) |
| Wochenliste · 1024 × 768 | [PNG](screenshots/light/01-wochenliste-1024.png) | [PNG](screenshots/dark/01-wochenliste-1024.png) |
| Resteabend ausgewählt | [PNG](screenshots/light/02-resteabend.png) | [PNG](screenshots/dark/02-resteabend.png) |
| Freier Tag ausgewählt | [PNG](screenshots/light/03-nicht-geplant.png) | [PNG](screenshots/dark/03-nicht-geplant.png) |
| Planen-Menü geöffnet | [PNG](screenshots/light/04-planen-menue.png) | [PNG](screenshots/dark/04-planen-menue.png) |
| Vorratsauswahl beim Mischen | [PNG](screenshots/light/05-mischen-vorraete.png) | [PNG](screenshots/dark/05-mischen-vorraete.png) |

Insgesamt **14 Screenshots**. [Prüfbericht und Quellprüfsumme](capture-manifest.json).

## Prüfung und Weiterverwendung

Die ausgewählte Vorschau wurde in Chrome bei **1440 × 900, 1280 × 800 und 1024 × 768 px**, jeweils hell/dunkel und mit emulierter reduzierter Bewegung geprüft. Schrift und Bilder wurden geladen, sieben Tagesziele und horizontale Überläufe kontrolliert, Zustände geöffnet und die Fokus-Rückgabe nach dem Dialog geprüft. Externe Netzwerkanfragen waren blockiert; es wurden keine angefordert und keine Laufzeitfehler festgestellt.

Die ursprüngliche Wochenliste wurde zusätzlich im [Desktop-Vergleich](../2026-11-14-desktop-drafts/capture-manifest.json) bei schmalen Ansichten, geringer Höhe und mit weiteren Tastatur- und Planungsaktionen geprüft. Keine echte iPhone-/Safari- oder iOS-Tastaturprüfung.

`source/desktop-week.template.html` ist die lesbare Quelle; `source/mockups.fragment.html` enthält bereits alle Medien. Die Quelle teilt Hilfsfunktionen mit dem früheren Vergleich, stellt in dieser Referenz aber ausschließlich die ausgewählte Wochenliste dar.

Zum Aktualisieren zuerst `source/build-fragment.cjs` mit Node.js ausführen, das Fragment erneut über den Visualize-Standalone-Renderer nach `preview.html` exportieren und mit `source/finalize-export.cjs` die lokale Lucide-Bibliothek einbinden. Danach erstellt `source/capture-screenshots.cjs` mit Playwright und installiertem Chrome die 14 Aufnahmen erneut. Optionale Modulpfade: `WOCHENTISCH_LUCIDE_MODULE` und `WOCHENTISCH_PLAYWRIGHT_MODULE`. Die Werkzeuge sind keine Abhängigkeiten der produktiven App. Lucide 1.8.0: [Lizenz](source/lucide-LICENSE.txt).

Neue größere Änderungen als weiteren datierten oder versionierten Referenzstand sichern. Die übrigen Desktop-Screens werden von dieser Auswahl abgeleitet und anschließend separat abgestimmt.
