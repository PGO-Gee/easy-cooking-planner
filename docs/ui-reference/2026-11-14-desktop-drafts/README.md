# Desktop-Entwürfe · Wochenplan

Stand des ursprünglichen Vergleichs: 14. November 2026. **Anschließend wurde die Wochenliste mit Gerichtsvorschau ausgewählt.** Die [ausgewählte Desktop-Referenz](../2026-11-14-desktop/README.md) ist für die Umsetzung maßgeblich; dieser Ordner bewahrt den früheren Vergleich.

Die Entwürfe übertragen den [Styleguide](../../../STYLEGUIDE.md) auf eine Desktop-Ansicht. Sie sind keine produktive Umsetzung. Die abgestimmten Desktop-Regeln stehen inzwischen im Styleguide. Die [gesicherten mobilen Referenzen](../2026-11-14/README.md) bleiben unverändert.

## Vorschau

**[Interaktive Desktop-Vorschau öffnen](preview.html)** – lokal im Browser, ohne Internet nutzbar. Über die Auswahl unter dem Entwurf zwischen **Wochenliste** und **Wochenraster** wechseln; über Hell/Dunkel die Darstellung vergleichen. Für die Standardansicht das Browserfenster auf etwa 1440 px Breite öffnen.

Beide Varianten haben dieselbe Seitenleiste, denselben Header und dieselbe Beispielwoche:

| Tag | Planung |
| --- | --- |
| Montag, 16. November | Spaghetti Bolognese · fixiert |
| Dienstag, 17. November | Tofu-Curry mit Reis |
| Mittwoch, 18. November | Resteabend |
| Donnerstag, 19. November | Lachs mit Kartoffeln |
| Freitag, 20. November | Nicht geplant |
| Samstag, 21. November | Nicht geplant |
| Sonntag, 22. November | Kartoffelgratin |

### Wochenliste

Alle sieben Tage stehen links in einer kompakten Liste. Rechts erscheint das ausgewählte Gericht mit Foto, Dauer, Portionen und Zutaten. Montag ist anfangs ausgewählt. Ein freier Tag zeigt „Gericht auswählen“; ein Resteabend zeigt eine kurze Erklärung. „Rezept ansehen“ öffnet zusätzlich die vollständige Zubereitung.

### Wochenraster

Ab 1280 px verfügbarer Vorschau-Breite stehen sieben Tagespalten nebeneinander. Bei 1024 px sind es vier und drei Spalten. Freie Tage und Resteabende beanspruchen innerhalb ihrer Spalte nur eine kompakte Statuszeile. Gericht anklicken öffnet eine schließbare Detailansicht über dem Plan.

### Ausprobierbare Interaktionen

- Tagesauswahl, Rezeptdetails, freie Tage und Resteabende ansehen.
- Auf einem freien Tag ein Beispielgericht auswählen; die Planung wird in beiden Varianten aktualisiert.
- Gerichte fixieren und wieder lösen.
- Über **Planen → 7 Tage mischen** die optionale Vorratsauswahl öffnen. Vorräte wählen oder überspringen; fixierte Gerichte bleiben beim lokalen Mischen erhalten. Es gibt keinen separaten Menüpunkt „Vorräte wählen“.
- Über **Woche wählen** zwischen drei Beispielwochen wechseln. Es werden bewusst dieselben Beispielgerichte wiederverwendet.
- Dialoge über Schließen, Escape oder Antippen der abgedunkelten Fläche schließen; Tastaturfokus bleibt im Dialog und kehrt anschließend zum Einstieg zurück.

Die anderen Einträge der Seitenleiste zeigen lediglich den vorgesehenen Zugang; Desktop-Entwürfe dieser Screens folgen nach der Layoutauswahl. Sämtliche Änderungen in der Vorschau sind lokal und nach Neuladen zurückgesetzt. Keine Anmeldung, Synchronisierung oder produktiven App-Daten werden verwendet.

## Screenshots

Die Aufnahmen zeigen den vollständigen App-Inhalt. Die Reiter, Hell/Dunkel-Steuerung und Variantenauswahl gehören zur Präsentation und sind nicht Teil der produktiven Oberfläche.

### Standardansicht · 1440 × 900 px

| Variante | Hell | Dunkel |
| --- | --- | --- |
| Wochenliste | [PNG](screenshots/light/01-wochenliste-1440.png) | [PNG](screenshots/dark/01-wochenliste-1440.png) |
| Wochenraster | [PNG](screenshots/light/02-wochenraster-1440.png) | [PNG](screenshots/dark/02-wochenraster-1440.png) |

### Weitere Desktop-Breiten

| Variante / Viewport | Hell | Dunkel |
| --- | --- | --- |
| Wochenliste · 1280 × 800 | [PNG](screenshots/light/01-wochenliste-1280.png) | [PNG](screenshots/dark/01-wochenliste-1280.png) |
| Wochenraster · 1280 × 800 | [PNG](screenshots/light/02-wochenraster-1280.png) | [PNG](screenshots/dark/02-wochenraster-1280.png) |
| Wochenliste · 1024 × 768 | [PNG](screenshots/light/01-wochenliste-1024.png) | [PNG](screenshots/dark/01-wochenliste-1024.png) |
| Wochenraster · 1024 × 768 | [PNG](screenshots/light/02-wochenraster-1024.png) | [PNG](screenshots/dark/02-wochenraster-1024.png) |

### Zustände · 1440 px Breite

| Zustand | Hell | Dunkel |
| --- | --- | --- |
| Wochenliste: Resteabend ausgewählt | [PNG](screenshots/light/03-wochenliste-resteabend.png) | [PNG](screenshots/dark/03-wochenliste-resteabend.png) |
| Wochenliste: freier Tag ausgewählt | [PNG](screenshots/light/04-wochenliste-freier-tag.png) | [PNG](screenshots/dark/04-wochenliste-freier-tag.png) |
| Planen-Menü geöffnet | [PNG](screenshots/light/05-planen-menue.png) | [PNG](screenshots/dark/05-planen-menue.png) |
| Vorräte innerhalb des Mischvorgangs | [PNG](screenshots/light/06-mischen-vorraete.png) | [PNG](screenshots/dark/06-mischen-vorraete.png) |
| Wochenraster: Rezeptdialog | [PNG](screenshots/light/07-wochenraster-rezept.png) | [PNG](screenshots/dark/07-wochenraster-rezept.png) |

Insgesamt **22 Screenshots**. Prüfbericht mit Browserversion, Dateiliste und Quellprüfsumme: [capture-manifest.json](capture-manifest.json).

## Prüfung und Grenzen

Geprüft in Desktop-Chrome, jeweils Hell/Dunkel und emulierte reduzierte Bewegung:

- Desktop: **1440 × 900, 1280 × 800, 1024 × 768 px**.
- Zusätzliche schmale Fallbacks: **736 × 390, 390 × 844 und 320 × 568 px**.
- Geringe Höhe als Fallback: **390 × 340 px**. Das ist keine reale iOS-Tastaturprüfung.
- Keine horizontalen Überläufe, geladene Schrift und Bilder, lesbare ungekürzte Gerichtsnamen, sieben sichtbare Tage und passende Spaltenzahlen.
- Tagesauswahl, Hinzufügen auf einem freien Tag, Vorratsauswahl und Beibehaltung des fixierten Montags beim Mischen.
- Menüs, Öffnen per Tastatur, Escape, Fokus-Rückgabe und Dialoge bei kleinen Breiten/Höhen.
- Der eigenständige Export wurde mit blockierten Internetanfragen bedient. Icons, Schrift und Bilder sind eingebettet.

Die schmalen Fallbacks halten den Desktop-Entwurf erreichbar, ersetzen aber nicht die abgestimmten mobilen Screens. Keine echte iPhone-/Safari-Prüfung. Der tatsächliche Prüfstatus steht im Manifest.

## Dateien für weitere Iterationen

- `source/desktop-week.template.html`: lesbare HTML-/CSS-/JS-Quelle mit Medien-Platzhaltern.
- `source/build-fragment.cjs`: bindet die bereits gesicherten Bilder, Rezepte und Schriften aus der mobilen Referenz ein. Benötigt nur Node.js; verändert die mobile Referenz nicht.
- `source/mockups.fragment.html`: vollständige Quelle mit eingebetteten Medien.
- `preview.html`: eigenständiger Export der Quelle, inklusive lokaler Icons.
- `source/finalize-export.cjs`: bindet nach einem erneuten Visualize-HTML-Export Lucide ein; benötigt eine lokale Lucide-Installation, optional über `WOCHENTISCH_LUCIDE_MODULE` angegeben.
- `source/check-and-capture.cjs`: prüft den Export und erstellt die Aufnahmen. Benötigt Playwright und installiertes Chrome. Ein abweichender Playwright-Modulpfad kann über `WOCHENTISCH_PLAYWRIGHT_MODULE` angegeben werden.
- `source/lucide-LICENSE.txt`: Lizenz der eingebetteten Lucide-Icons, Version 1.8.0.

Die Werkzeuge sind ausschließlich für die Designreferenz gedacht und fügen der produktiven App keine Abhängigkeiten hinzu. Nach Änderung der Vorlage zuerst das Fragment erzeugen, dieses erneut als eigenständige HTML-Vorschau exportieren, Icons einbinden und danach neu prüfen/aufnehmen:

```sh
node docs/ui-reference/2026-11-14-desktop-drafts/source/build-fragment.cjs
# mockups.fragment.html mit dem Visualize-Standalone-Renderer nach preview.html exportieren
node docs/ui-reference/2026-11-14-desktop-drafts/source/finalize-export.cjs
node docs/ui-reference/2026-11-14-desktop-drafts/source/check-and-capture.cjs
```

Ausgewählt wurde die Wochenliste. Die übrigen Desktop-Screens werden auf dieser Grundlage weiterentwickelt und separat abgestimmt.
