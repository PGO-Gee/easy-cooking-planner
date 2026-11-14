# Wochentisch – UI-Styleguide

Stand: 14. November 2026 · Mobil: **Fokus / Wochenmenü** · Desktop: **Wochenliste mit Gerichtsvorschau**

Dieser Guide hält die gemeinsam abgestimmte Gestaltung fest und dient als Grundlage für die nächsten Screens. Er beschreibt das Zielbild; die bestehende App ist noch nicht auf dieses Design umgestellt. Bestehende Funktionen bleiben bei der Gestaltung berücksichtigt. Die iPhone-first-Vorgaben aus `AGENTS.md` gelten zusätzlich.

Die zugehörigen [Screenshots und die interaktive Vorschau](docs/ui-reference/2026-11-14/README.md) sind als datierter Referenzstand im Projekt gespeichert.
Für den Desktop-Wochenplan gilt die separat gesicherte [ausgewählte Wochenliste mit Vorschau und Screenshots](docs/ui-reference/2026-11-14-desktop/README.md).

## 1. Gestaltungsrichtung

Eine moderne, persönliche Kochplaner-App mit ruhigen Flächen, echten Gerichtsbildern und klarer Bedienung. Die vorhandene Schrift **Comic Relief** gibt der Oberfläche ihren Charakter. Die Anlehnung an Apple zeigt sich in Hierarchie, Abständen, verständlichen Aktionen und zurückhaltender Navigation.

- Heller, leicht kühler Hintergrund; weiße Inhaltsflächen; blaue Interaktionsfarbe.
- Bilder machen Gerichte erkennbar und geben der App Persönlichkeit.
- Wenige sichtbare Aktionen, jeweils dort, wo sie gebraucht werden.
- Runde Formen gezielt für Karten, Touch-Ziele und Navigation verwenden.
- Flächige Gestaltung ohne dekorative Verläufe, Glas-Effekte oder Schatten auf jeder Karte.
- Kurze, konkrete Texte. Keine Begrüßungssprüche, Werbezeilen oder dekorativen Kennzahlen.

## 2. Abgestimmte Entscheidungen

| Element | Festlegung |
| --- | --- |
| Mobiler Wochenplan | „Fokus“: ein hervorgehobenes Gericht mit großem Foto, darunter die kompakte Woche |
| Desktop-Wochenplan | Wochenliste links, Vorschau des ausgewählten Tages rechts; schmale Seitenleiste für die Navigation |
| Schrift | Vorhandene Comic Relief beibehalten, regulär und fett |
| Header | Screen-Titel und gegebenenfalls Datum; kein zusätzlicher App-Name |
| Header-Spruch | Entfällt |
| Wochenaktionen | Ein beschrifteter **Planen**-Button mit Regler-Symbol |
| Weitere Aktionen | Über das Wochenmenü erreichbar; keine separate Button-Reihe über den Gerichten |
| Gerichtsbilder | Vorhandene Bilder aus dem Projekt verwenden, auch in kompakten Zeilen |
| Resteabend | Kompakte grüne Zeile mit Datum, „Resteabend“ und Rücklauf-Symbol |
| Navigation | Wochenplan, Gerichte, Zubereiten, Einkauf; Icons mit sichtbaren Beschriftungen |

Die aktuellen mobilen und ausgewählten Desktop-Referenzen beginnen direkt mit dem Screen-Titel. Frühere Entwürfe mit zusätzlichem App-Namen im Header sind überholt.

## 3. Header und Aktionen

Der Screen beginnt direkt mit seinem Titel. Im Wochenplan steht rechts **Planen**, darunter links der Zeitraum. Danach folgt der Inhalt.

```text
Wochenplan                       [≡ Planen]
16. – 22. November 2026

[Großes Gerichtsfoto]
```

Das Zeichen im Schema steht für ein Regler-Symbol, nicht für ein zusätzliches Menü-Icon.

- Genau ein Screen-Titel. Kein zusätzlicher Marken-Header innerhalb der Hauptscreens.
- Im Wochenplan keine Profil-Schaltfläche, Datumspfeile und Aktionsleiste zusätzlich im Header.
- **Planen** bleibt sichtbar beschriftet. Ein alleinstehendes „…“ ist für diesen Einstieg zu unklar.
- Das Wochenmenü enthält die Wochenwahl und „7 Tage mischen“. Profil und Einstellungen stehen dort als getrennte Gruppe.
- Vorräte werden innerhalb von „7 Tage mischen“ ausgewählt oder übersprungen, bevor der Plan erstellt wird. Ein separater Menüpunkt „Vorräte wählen“ entfällt. Fixierte Gerichte bleiben beim Mischen erhalten.
- Ein geöffnetes Menü hat einen deckenden Hintergrund, klare Einträge und erreichbare Touch-Ziele. Es bleibt innerhalb des verfügbaren Bildschirms.
- Auf anderen Screens richtet sich die Hauptaktion nach der Aufgabe: etwa „Rezept hinzufügen“ oder „Bearbeiten“. „Planen“ wird nicht pauschal auf jeden Screen übertragen.
- Häufig benötigte Eingaben bleiben direkt erreichbar, beispielsweise Artikel ergänzen beim Einkauf oder der nächste Schritt beim Kochen.

## 4. Farben

Die Werte stammen aus dem gewählten Mockup. Sie sind Zielwerte für semantische Farbrollen und noch keine Änderung an den produktiven Stylesheets.

| Rolle | Hell | Dunkel | Verwendung |
| --- | --- | --- | --- |
| Hintergrund | `#F6F7FA` | `#171B21` | Screen-Hintergrund |
| Oberfläche | `#FFFFFF` | `#242A33` | Gerichtskarten, Menüs, Navigation |
| Haupttext | `#202B3A` | `#EDF2FA` | Titel, Gerichtsnamen, wesentliche Inhalte |
| Sekundärtext | `#636F7E` | `#ADB9C9` | Zeit, Portionen, ergänzende Angaben |
| Trennlinie | `#E2E6ED` | `#3C4654` | Dezente Abgrenzungen |
| Aktion / Auswahl | `#2D6096` | `#AACDF5` | Interaktive Elemente und aktive Zustände |
| Inhalt auf gefüllter Aktion | `#FFFFFF` | `#17283E` | Text und Icons auf blauem Button |
| Sanfte Auswahlfläche | `#EAF1FA` | `#2B3B50` | Planen-Button, fixiertes Gericht, aktiver Navigationseintrag |
| Resteabend-Fläche | `#E8F0E9` | `#293E32` | Bewusst anderer Tagestyp |
| Resteabend-Inhalt | `#3C604C` | `#B9D8C3` | Symbol und Text im Resteabend-Band |

Blau kennzeichnet Aktionen und Auswahl. Grün kennzeichnet im Wochenplan den Resteabend. Nicht jedem Gericht eine andere Hintergrundfarbe geben. Fehler, Warnungen und Erfolgsmeldungen brauchen eigene semantische Rollen; deren konkrete Farben werden beim betreffenden Screen festgelegt. Zustände müssen zusätzlich durch Text oder Symbol erkennbar sein.

### Dunkler Modus

Der dunkle Modus ist als Bestandteil der Gestaltungsrichtung abgestimmt.

- Dunkle Variante derselben Gestaltung: gleicher Aufbau, gleiche Schrift, gleiche Abstände und Interaktionen.
- Dunkler Hintergrund `#171B21`, etwas hellere Inhaltsflächen `#242A33`. Karten und Menüs bleiben deckend und erkennbar voneinander getrennt.
- Aktionen verwenden das hellere Blau `#AACDF5`. Bei gefüllten Buttons steht darauf dunkler Text `#17283E`.
- Der Resteabend behält seine grüne Bedeutung: Fläche `#293E32`, Inhalt `#B9D8C3`. Freie Tage bleiben neutral mit feiner Kontur.
- Gerichtsfotos behalten ihre natürlichen Farben; keine pauschale Abdunklung oder Farbumkehr.
- Abgehakte Einkaufsartikel bleiben an ihrer Stelle und werden durchgestrichen. Text und Mengen bleiben auch im dunklen Modus lesbar.
- Die App berücksichtigt die Systemeinstellung und ihre vorhandene manuelle Theme-Wahl. Der Hell/Dunkel-Schalter über den Mockups dient nur dem direkten Vergleich der Entwürfe und gehört nicht in jeden Screen-Header.

## 5. Typografie

**Comic Relief** aus `fonts/comic-relief/`, Gewichte 400 und 700; Fallback `system-ui, sans-serif`. Keine zweite dekorative Schrift hinzufügen.

Die folgenden Größen bilden ein Arbeitsraster für weitere Entwürfe. Wo mehr Lesbarkeit erforderlich ist, hat sie Vorrang vor der Verdichtung des Mockups.

| Textrolle | Richtwert | Gewicht |
| --- | --- | --- |
| Screen-Titel | 25–28 px | 700 |
| Name im hervorgehobenen Gericht | 19–21 px | 700 |
| Gericht in kompakter Liste | 13–15 px | 700 |
| Lesetext, Zutaten, Zubereitung | 15–16 px | 400 |
| Datum, Zeit und Portionen | 11–13 px | 400 |
| Button-Beschriftung | 12–14 px | 400 oder 700 |
| Navigation | Mindestens 11 px | Aktiv 700 |
| Texteingaben und Auswahlfelder | Mindestens 16 px | 400 |

- Fließtext mit etwa 1,5-facher Zeilenhöhe; kurze Überschriften etwa 1,25–1,4.
- Lange Gerichtsnamen dürfen umbrechen. Sie sollen ohne Hover lesbar sein.
- Fett hebt Titel und wichtige Inhalte hervor. Nicht jede Metainformation betonen.
- Keine erzwungene Einzeiligkeit oder aggressive Verringerung der Schriftgröße bei 320 px.

## 6. Abstände und Formen

| Element | Richtwert |
| --- | --- |
| Horizontaler Screen-Abstand | 20 px, auf sehr schmalen Screens 14–16 px |
| Abstand zwischen größeren Abschnitten | 16–24 px |
| Abstand zwischen kompakten Gerichtszeilen | 7–10 px |
| Innenabstand kompakter Karten | 8–12 px |
| Abstand zwischen Foto und Text | 10–12 px |
| Radius von Gerichtskarten | Etwa 18 px |
| Radius kleiner Bilder | 10–12 px |
| Radius kompakter Tageszeilen | Etwa 12 px |
| Effektives Touch-Ziel | Mindestens 44 × 44 CSS-Pixel |

Pillenformen für „Planen“ und die Navigation sparsam einsetzen. Normale Karten bleiben abgerundete Rechtecke. Ein dezenter Schatten ist für ein überlagerndes Menü sinnvoll; Gerichtskarten werden vor allem durch ihre Fläche getrennt.

Der äußere Smartphone-Rahmen, die zentrierte Vorschau und die große Bühnenhöhe der Mockups gehören ausschließlich zur Präsentation. Sie sind keine Vorgaben für die App. Auch die Vorschau-Breite von rund 390 px begrenzt nicht das Desktop-Layout.

## 7. Bilder und Gerichtskarten

### Hervorgehobenes Gericht

- Großes Foto über die Kartenbreite, darunter der Text auf deckender Oberfläche.
- Reihenfolge: Tag und Datum, Gericht, Dauer und Portionen.
- Fixieren als separates Touch-Ziel neben dem Text.
- Text nicht über das Foto legen; die Lesbarkeit bleibt unabhängig vom Bildmotiv.
- In der bisherigen Vorschau ist das Foto ungefähr doppelt so breit wie hoch. Bei unterschiedlichen Breiten die Bildproportion bewahren und den Ausschnitt sinnvoll anpassen.

Welches Gericht hervorgehoben wird, ist noch offen. Die Vorschau verwendet Montag als Beispieldatensatz. Eine Regel wie „heutiges“ oder „nächstes Gericht“ wird vor der Umsetzung festgelegt.

### Kompakte Gerichtszeile

- Foto links, Informationen mittig, Fixieren rechts.
- Kleines Foto ungefähr 50–60 px breit und 54–64 px hoch, passend beschnitten.
- Datum als kleine blaue Orientierung, Gericht deutlich hervorgehoben, darunter Dauer und Portionen.
- Gewöhnliche Zeilen haben eine neutrale Oberfläche ohne dekorativen Rahmen.
- Fixierung wird durch Symbolzustand und sanften blauen Hintergrund sichtbar. Ein nicht fixiertes Gericht hat kein dauerhaft gefülltes Icon-Feld.

### Bildmaterial und Fallbacks

- Vorhandene Dateien in `images/recipes/` verwenden; kleine Vorschaubilder für Listen, größere Dateien für die hervorgehobene Ansicht.
- Ausschnitte mit `object-fit: cover`; Essen soll vollständig genug erkennbar bleiben.
- Für ein Gericht ohne Bild einen ruhigen neutralen Platzhalter verwenden. Kein zufälliges fremdes Essensfoto zuordnen.
- Bildflächen reservieren, damit der Inhalt beim Laden nicht springt.
- Aussagekräftige Alternativtexte verwenden; bei rein dekorativer Wiederholung des benachbarten Namens ist ein leerer Alternativtext möglich.

## 8. Resteabend, offene Tage und Zustände

### Resteabend

Der Resteabend ist eine geplante Entscheidung und erhält einen eigenen Aufbau:

- Kompakte, sanft grüne Zeile an ihrer chronologischen Position, etwa 44 px hoch.
- Links das kurze Datum, etwa **Mi, 18.**, mittig **Resteabend**, rechts das Rücklauf-Symbol.
- Auf schmalen Screens möglichst einzeilig; keine zusätzliche Unterzeile oder eigenes Icon-Feld. Bei vergrößerter Schrift darf die Zeile wachsen, statt Inhalte abzuschneiden.
- Kein Gerichtsfoto, keine Zubereitungszeit und keine Portionsangabe.
- Keine Gestaltung wie ein fehlgeschlagenes oder unvollständiges Gericht.

### Noch offener Tag

- Kompakte neutrale Zeile mit feiner Kontur: kurzes Datum links, **Nicht geplant** mittig, Plus rechts. Etwa 44 px hoch, bei Bedarf mitwachsend.
- Die ganze Zeile ist ein Touch-Ziel zum Hinzufügen eines Gerichts. Keine zusätzliche Unterzeile.
- Jeder freie Tag bleibt einzeln sichtbar, auch bei mehreren aufeinanderfolgenden freien Tagen. Ein offener Tag darf nicht wie der grüne Resteabend aussehen.
- Chronologische Reihenfolge beibehalten.

### Weitere Zustände

- Leere Sammlung: kurzer Grund und eine konkrete Aktion, etwa „Rezept hinzufügen“.
- Laden: ruhiger Platzhalter in der späteren Inhaltsgröße; bei Animation reduzierte Bewegung berücksichtigen.
- Fehler: konkrete Erklärung und eine passende nächste Aktion. Allgemeine Erfolgsmeldungen nicht dauerhaft als zusätzliche Karten anzeigen.
- Offline- und Synchronisierungsinformationen nach Bedeutung sichtbar halten; sie dürfen nicht allein zugunsten eines ruhigen Headers verschwinden.

## 9. Navigation, Menüs und Formulare

### Einkaufszettel

- Artikel ergänzen steht direkt unter dem Header. Der Mahlzeitfilter liegt im Menü **Liste**; ein aktiver Filter wird sichtbar und zurücksetzbar angezeigt.
- Die Zeilen zeigen ausschließlich Checkbox, Artikelname und Menge. Keine Emojis und keine dauerhaft sichtbaren Gerichtsnamen.
- Abgehakte Artikel bleiben an ihrer Position und werden durchgestrichen. Ein separater Bereich „Schon eingekauft“ entfällt.
- Langes Drücken auf einen Artikel öffnet ein kleines Pop-up mit den zugeordneten geplanten Gerichten. Mehrere Zuordnungen erscheinen als Liste; manuell ergänzte Artikel erhalten einen entsprechenden Hinweis.
- Als Ausgangspunkt gelten 500 ms Haltezeit. Scrollen oder Abbrechen der Geste verhindert das Öffnen; nach einem langen Drücken wird der Artikel nicht zusätzlich abgehakt.
- Normales Antippen hakt weiterhin ab oder hebt den Haken auf. Am Desktop ist die Zuordnung auch über Rechtsklick, an der Tastatur über Enter oder Shift+F10 beim fokussierten Artikel erreichbar.
- Das Pop-up hat einen Schließen-Button, lässt sich mit Escape oder außerhalb antippen schließen und bleibt innerhalb der verfügbaren Breite. Es zeigt die Gerichtsnamen als Zusatzinformation, ohne die Liste dauerhaft zu verdichten.

### Allgemeine Regeln

- Mobil bleibt die Hauptnavigation über vier beschriftete Ziele erreichbar: **Wochenplan**, **Gerichte**, **Zubereiten**, **Einkauf**.
- Aktiven Screen mit blauer Schrift, passendem Icon und sanfter Auswahlfläche kennzeichnen.
- Icons aus einem einheitlichen Outline-System verwenden. Beschriftungen tragen die Bedeutung; keine wechselnden Emoji als Bedienelemente.
- Fixieren, Hinzufügen und andere wiederkehrende Aktionen behalten Symbol, Farbe und Position über Screens hinweg bei.
- Ob die mobile Navigation feststeht, wird mit den nächsten Screens entschieden. Bei fixer Position Safe-Area, Inhaltsabstand und Tastatur berücksichtigen.
- Desktop erhält eine zum Platz passende Navigation und breitere Inhaltsanordnung. Nicht einfach eine schmale Telefonansicht auf dem Desktop zentrieren.
- Formulare haben sichtbare Labels, mindestens 16 px Eingabeschrift und verständliche Validierung direkt beim Feld.
- Dialoge und Aktionsmenüs bleiben auch bei kleiner Höhe und geöffneter Tastatur erreichbar und scrollbar. Im Zweifel eine passende Sheet-Ansicht für kleine Screens entwerfen.
- Keine wesentliche Aktion ausschließlich über Hover oder eine unbeschriftete Geste zugänglich machen. Sichtbarer Tastaturfokus bleibt erhalten.

## 10. Abgestimmte Desktop-Richtung

Ausgewählt ist die **Wochenliste mit Gerichtsvorschau**. Das Wochenraster bleibt als verworfene Alternative im früheren Vergleich dokumentiert und ist keine Umsetzungsvorgabe.

### Aufbau des Wochenplans

- Links eine schmale, deckende Seitenleiste: Wochenplan, Gerichte, Zubereiten und Einkauf. Profil und Einstellungen stehen unten, getrennt von der Hauptnavigation. Der aktive Bereich ist blau und sanft hinterlegt.
- Seitenleiste ungefähr 200 px breit bei großen Desktop-Ansichten und 172 px bei 1024 px Breite. Der Hauptbereich hat etwa 32 px horizontalen Abstand, bei 1024 px etwa 24 px.
- Der Header enthält „Wochenplan“, darunter den Zeitraum, rechts **Planen**. Kein zusätzlicher Marken-Header und keine parallele Reihe für Misch- oder Vorratsaktionen.
- Darunter zwei Bereiche im Verhältnis ungefähr 45 : 55 mit etwa 20–26 px Abstand: Wochenliste links, Gerichtsvorschau rechts. Bei 1024 px bleiben beide nebeneinander und ohne horizontales Scrollen nutzbar.
- Alle sieben Tage bleiben chronologisch sichtbar. Geplante Tage zeigen Datum, kleines Foto, Gericht, Dauer und Portionen. Der ausgewählte Tag erhält einen feinen blauen Rahmen und eine sanfte Auswahlfläche.
- Freie Tage und Resteabende bleiben etwa 44 px hohe Zeilen. Resteabend ist grün, „Nicht geplant“ neutral. Beide können ausgewählt werden, ohne aus der Wochenübersicht zu verschwinden.

### Vorschau und Bedienung

- Anfangs ist Montag ausgewählt. Eine andere Tagesauswahl aktualisiert die rechte Vorschau; die Wochenliste bleibt sichtbar.
- Bei einem Gericht: breites Foto, Tag und Datum, Gerichtstitel, Fixierung, Dauer, Portionen, Zutatenübersicht und **Rezept ansehen**.
- Bei einem freien Tag: Datum, „Nicht geplant“, kurze Erklärung und **Gericht auswählen**. Der Resteabend erhält eine grüne Erklärung ohne Foto oder erfundene Zubereitungsangaben.
- **Rezept ansehen** öffnet eine schließbare, bei Bedarf scrollbar bleibende Detailansicht mit Zubereitung. Schließen bleibt erreichbar; Escape und Antippen außerhalb schließen ebenfalls. Der Tastaturfokus bleibt im Dialog und kehrt danach zum Einstieg zurück.
- **Planen → 7 Tage mischen** führt zur optionalen Vorratsauswahl. Vorräte können ausgewählt oder übersprungen werden. Fixierte Gerichte bleiben erhalten; die im Mockup gezeigte Mischlogik ist nur eine lokale Simulation.
- Gleiche Comic-Relief-Schrift, Farbrollen, Bilder und Zustandsfarben wie mobil. Keine zusätzliche Desktop-Farbwelt oder dekorativen Kennzahlen.

### Übertragung auf weitere Screens

Die Seitenleiste und der reduzierte Header bilden die Desktop-Basis. Die konkrete Desktop-Anordnung von Gerichtsgalerie, Rezeptdetails, Kochmodus und Einkaufszettel ist noch separat abzustimmen. Eine schmale Fallback-Ansicht des Desktop-Mockups ersetzt nicht die bereits abgestimmten mobilen Screens.

Referenzgrößen für die Umsetzung: **1440 × 900, 1280 × 800 und 1024 × 768 px**, jeweils hell und dunkel. Desktop-Anpassungen dürfen die mobilen Regeln und Safe-Areas nicht beeinträchtigen.

## 11. Weitere Screens gemeinsam durchgehen

Die folgenden Übertragungen sind Ausgangspunkte für Mockups, noch keine abgestimmten Screen-Entwürfe:

| Screen | Was wir als Nächstes klären |
| --- | --- |
| Meine Gerichte | Bildliste oder Bildraster, Suche, Hinzufügen und Katalogzugang |
| Rezeptdetail | Großes Foto, Portionen, Zutaten und Zubereitung in gut lesbarer Reihenfolge |
| Zubereiten | Aktueller Schritt, große Vor-/Zurück-Ziele, Zugriff auf Zutaten |
| Einkaufszettel | Gut abhakbare Zeilen, Mengen, Kategorien und direktes Ergänzen; Fotos nur bei echtem Nutzen |
| Rezept bearbeiten | Klar gruppierte Felder, Tastaturverhalten, Speichern und Abbrechen |
| Profil und Einstellungen | Verständliche Gruppen und Zugang aus den relevanten Menüs |

Für jeden Screen zuerst die Hauptaufgabe benennen, dann den Header und die eine wichtigste Aktion festlegen. Danach prüfen, welche bestehenden Funktionen im Inhalt, in der Navigation oder in einem Menü liegen. So bleibt die Oberfläche ruhig, ohne Funktionen versehentlich zu verlieren.

### Prüfliste pro Screen

- [ ] Titel beschreibt den Screen; kein wiederholter App-Name oder Header-Spruch.
- [ ] Hauptaktion ist verständlich beschriftet; weitere Aktionen sinnvoll gruppiert.
- [ ] Comic Relief, Farbrollen und wiederkehrende Komponenten passen zum Guide.
- [ ] Gerichtsbilder unterstützen die Aufgabe; Sonderzustände sind eindeutig unterscheidbar.
- [ ] Lange Texte und alle relevanten Datenzustände passen ins Layout.
- [ ] Touch-Ziele sind mindestens 44 × 44 px groß und ausreichend getrennt.
- [ ] 320 px und ein typischer iPhone-Viewport im Hochformat geprüft.
- [ ] Querformat und geringe verfügbare Höhe geprüft; bei Formularen auch geöffnete Tastatur.
- [ ] Desktop funktioniert weiterhin; keine horizontale Überbreite oder abgeschnittenen Inhalte.
- [ ] Hell, Dunkel, Tastaturfokus und reduzierte Bewegung berücksichtigt.
- [ ] Safe-Areas und gegebenenfalls fixe Navigation berücksichtigt.
- [ ] Tatsächlich geprüfte Viewports und Zustände dokumentiert.

## 12. Umsetzung und bisherige Prüfung

Styleguide und Referenzpaket dokumentieren das Zielbild. Die produktive Oberfläche wurde noch nicht umgestellt. Bei der späteren Umsetzung vorhandene Stylesheets und Gestaltungsmuster weiterverwenden; keine zusätzliche allgemeine UI- oder Mobile-CSS-Datei einführen. Wiederkehrende Werte in die vorhandene Struktur integrieren.

Die Mockups wurden in Chrome bei **320 × 568, 390 × 844, 736 × 390 und 1024 × 768 px**, jeweils hell und dunkel sowie mit emulierter reduzierter Bewegung geprüft. Die überarbeitete Einkaufsliste wurde zusätzlich bei **390 × 340 px** sowie mit simulierten Touch-Haltegesten geprüft. Die Prüfung umfasste unter anderem geladene Bilder und Schrift, horizontale Überläufe, Menübedienung, Fixierung, Portionswahl, Kochschritte sowie Abhaken und Gerichtzuordnung beim Einkauf.

Das Referenzpaket enthält **22 Screenshots** der sieben Screens und vier zusätzlicher Zustände in Hell/Dunkel, aufgenommen bei **390 × 844 px** als vollständige Inhaltsansichten. Der eigenständige HTML-Export wurde mit blockierten externen Netzwerkanfragen geöffnet und bedient; Schriften, Bilder und Icons sind eingebettet.

Die ausgewählte Desktop-Wochenliste ist separat mit **14 Screenshots** bei **1440 × 900, 1280 × 800 und 1024 × 768 px** sowie zusätzlichen Tages- und Menüzuständen dokumentiert. Der eigenständige Export wurde in Hell/Dunkel ohne externe Netzwerkanfragen geprüft; Schrift, Bilder, sieben Tagesziele, fehlende horizontale Überläufe und Fokus-Rückgabe wurden kontrolliert. Der frühere Desktop-Vergleich enthält ergänzende Prüfungen schmaler Fallbacks und der lokalen Interaktionen.

Eine echte iPhone-/Safari-Prüfung, die Prüfung mit geöffneter iOS-Tastatur und die Prüfung der künftig umgestalteten produktiven Screens stehen aus. Die gemessenen Desktop-Breiten betreffen die eingebettete mobile Vorschau und bestätigen noch kein künftiges Desktop-Layout.
