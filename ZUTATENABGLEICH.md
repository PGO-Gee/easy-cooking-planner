# Zutaten im Vorrat vergleichen

Der gesamte Vorschlagskatalog wird über `ingredient-catalog.js` verarbeitet.
Die Zuordnung gilt beim Wochenmischen, bei Hinweisen auf ungenutzte Vorräte
und beim automatischen Abhaken der Einkaufsliste. Sie berücksichtigt Namen,
keine Mengen oder garantierten Ersatzmöglichkeiten beim Kochen.

## Drei Arten von Zuordnungen

1. **Synonyme:** Namen für dasselbe Produkt werden vereinheitlicht. Beispiele:
   Möhre/Karotte, Heidelbeere/Blaubeere, Porree/Lauch,
   Lauchzwiebel/Frühlingszwiebel, Sauerrahm/Saure Sahne,
   Passata/Passierte Tomaten und Rinderhack/Rinderhackfleisch.
   Bekannte Einzahl-/Mehrzahlformen und Schreibvarianten gehören ebenfalls dazu.
2. **Enge Produktformen:** Unterschiedliche Bezeichnungen bleiben gespeichert,
   passen aber beim Vorratsvergleich zusammen. Beispiele stehen unten.
3. **Oberbegriffe:** Eine ausdrücklich hinterlegte allgemeine Zutat trifft ihre
   konkreten Varianten, auch in umgekehrter Richtung. Verschiedene Varianten
   treffen sich dadurch nicht gegenseitig. `Käse` passt zu `Parmesan` und zu
   `Mozzarella`; `Parmesan` passt nicht zu `Mozzarella`.

## Enge Produktformen – Beispiele

| Bereich | Passende Bezeichnungen |
| --- | --- |
| Fisch | Lachs/Lachsfilet, Kabeljau/Kabeljaufilet, Seelachs/Seelachsfilet, Thunfisch/Thunfischfilet, Forelle/Forellenfilet; einschließlich Filet-Pluralformen |
| Fleisch | Hähnchenbrust/Hähnchenbrustfilet/Hähnchenfilet, Putenbrust/Putenfilet, Entenbrust/Entenfilet; Filet-Pluralformen und Geschnetzeltes/Fleischstreifen derselben Tierart |
| Frisches Gemüse | Tomaten/Kirsch-/Cherry-/Cocktail-/Rispen-/Fleischtomaten, Paprika/farbige Paprika/Spitzpaprika, Gurken/Salatgurken, Champignons/weiße oder braune Champignons |
| Unverarbeitetes Tiefkühlprodukt | Blattspinat/Spinat/Babyspinat/TK-Spinat, Erbsen/TK-Erbsen, Karotten/TK-Karotten, grüne Bohnen/TK-Bohnen, Brokkoli und Blumenkohl mit ihren Röschen und TK-Formen |
| Beeren | Erdbeeren/TK-Erdbeeren, Himbeeren/TK-Himbeeren, Blaubeeren/TK-Blaubeeren/TK-Heidelbeeren |
| Weitere Gemüseformen | Mais/Dosenmais/Zuckermais, Knoblauch/Knoblauchzehen, Ingwer/Ingwerwurzel, Kartoffeln/Speisekartoffeln |
| Obst | Zitrone/Bio-Zitrone, Limette/Bio-Limette, jeweils auch im Plural |
| Milchprodukte | Frischkäse/Doppelrahmfrischkäse/Naturfrischkäse, Quark/Speisequark/Magerquark |
| Getreide und Backen | Haferflocken/zarte oder kernige Haferflocken, Weizenmehl/Weizenmehl Type 405 oder 550, Dinkelmehl/Dinkelmehl Type 630, Backkakao/Kakaopulver |
| Würzen | Salz/Tafel-/Speisesalz, Pfeffer/schwarzer Pfeffer/schwarze Pfefferkörner |

Es werden ausschließlich die ausdrücklich hinterlegten Namen erkannt.
Beispielsweise werden beliebige zusätzliche Wörter wie „mit Haut“, „gewürzt“
oder „Bio“ nicht automatisch entfernt.

## Oberbegriffe

| Oberbegriff | Zugeordnete Varianten |
| --- | --- |
| Käse | Hinterlegte Sorten wie Parmesan, Mozzarella, Feta, Gouda, Halloumi, Frischkäse und weitere |
| Hartkäse | Parmesan, Pecorino, Grana Padano, Bergkäse |
| Reis | Basmati-, Jasmin-, Langkorn-, Risotto- und Vollkornreis |
| Pasta/Nudeln | Spaghetti, Penne, Fusilli, Bandnudeln, Makkaroni, Kritharaki, Suppennudeln |
| Mehl | Weizen-, Dinkel- und Vollkornmehl |
| Öl | Raps-, Oliven-, Sesam-, Kokos- und Sonnenblumenöl |
| Kürbis | Hokkaido/Hokkaidokürbis, Butternut/Butternutkürbis |
| Linsen | Rote Linsen, Berglinsen, Tellerlinsen, Belugalinsen |
| Currypaste | Rote, grüne und gelbe Currypaste |
| Tomaten aus der Dose | Gehackte und geschälte Tomaten |
| Rindfleisch | Hinterlegte Zuschnitte, Hackfleisch, Patty, Gulasch, Steak, Braten und Rouladen |
| Schweinefleisch | Hinterlegte unverarbeitete Zuschnitte, Hackfleisch, Schnitzel und Braten |
| Hähnchen | Brust/Filet, Schenkel/Keule, Flügel, Streifen/Geschnetzeltes |
| Pute | Brust/Filet, Schnitzel, Keule, Hackfleisch |
| Ente | Brust/Filet, Schenkel/Keule |
| Lammfleisch | Filet, Keule, Kotelett, Hackfleisch |

Wer einen konkreten Vorrat hat, sollte die konkrete Bezeichnung auswählen:
Ein allgemeiner Eintrag wie „Öl“ oder „Rindfleisch“ lässt dem Planer bewusst
mehr Spielraum als „Olivenöl“ oder „Rinderfilet“.

## Getrennte Produkte und unbekannte Namen

Unter anderem bleiben getrennt:

- Lachs, Räucherlachs und Seelachs; unspezifisches Fischfilet und Fischstäbchen.
- Milch und Kokosmilch; Tofu und Räuchertofu.
- Frische Tomaten, Tomatenmark und passierte oder gehackte Tomaten.
- Gurken und Gewürzgurken; Spinat und Rahmspinat; Kartoffeln und Pommes.
- Fleisch und verarbeitete Produkte wie Bacon, Prosciutto oder Chicken Nuggets.
- Verschiedene konkrete Käse-, Reis-, Pasta-, Mehl-, Öl- und Linsensorten.
- Frische und trockene Hefe; Zucker und Puderzucker; frische und getrocknete Kräuter.

Mehrdeutige Angaben wie „Sellerie“ werden nicht automatisch einer Knolle oder
Staudensellerie zugeordnet. Unbekannte eigene Namen passen nur bei gleichem
Namen nach Bereinigung von Groß-/Kleinschreibung und überflüssigen Leerzeichen.
Es gibt keine Teilwortsuche, automatische Übersetzung oder unscharfe Erkennung.

## Bestehende Daten und Einkaufsliste

Frühere breite Aliasregeln haben konkrete Sorten teilweise bereits in „Käse“,
„Reis“ oder eine Fleischart umbenannt. Enthält ein Gericht ein vollständiges
Rezept, stellt die App dessen konkrete Zutaten wieder für die Planung und
Einkaufsliste her. Ohne vollständiges Rezept bleibt der allgemeine Name
erhalten; die ursprüngliche Sorte kann nicht zuverlässig rekonstruiert werden.

Mengen und Einkaufsstatus behalten ihre bisherigen konkreten Schlüssel.
Eine neu getrennte Zutat kann daher wieder als offen erscheinen. Eine neue
Zuordnung schreibt Rezeptbezeichnungen nicht in ihren Oberbegriff um.

Die vollständigen Zuordnungstabellen stehen im Zutatenkatalog im Code.
Neue Namen werden dort ausdrücklich ergänzt und durch positive sowie negative
Vergleichstests abgesichert.
