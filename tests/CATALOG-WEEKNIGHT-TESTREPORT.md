# Katalogergänzung vom 12. November 2026

- 13 neue Einträge auf dem verbundenen Supabase-Projekt `iuuekjupdxenkcegbsym` angelegt. Alle gespeicherten Rezeptfelder, Einkaufszutaten, Kategorien, Zeiten, Emojis und Nährwerte stimmen mit der JSON-Quelle überein. Alle Rezepte bestehen `wochentisch_private.valid_recipe`.
- Ein zweiter Lauf von `supabase/catalog-weeknight-additions.sql` legt keine weiteren Einträge an. Buchweizen-Eintopf bleibt genau einmal vorhanden; bestehende Einträge und Haushaltskopien wurden nicht geändert.
- 24 Node-Tests bestanden: `catalog-weeknight.test.cjs`, `recipe-model.test.cjs`, `recipe-images.test.cjs`, `ingredient-catalog.test.cjs`. Zusätzlich JavaScript-Syntax und `git diff --check` geprüft.
- Alle 13 neuen Gerichte rufen über die echte `recipePhoto`-Funktion sowohl Detailbilder als auch Vorschaubilder ab, im Katalog und nach Übernahme in die eigene Sammlung.
- 26 JPEG-Dateien auf tatsächliche Abmessungen geprüft: Details 960 × 720, Vorschaubilder 168 × 126. Zusammen rund 1,95 MiB. Alle Motive in einer Kontaktübersicht visuell geprüft.
- Keine Layout- oder CSS-Änderungen. Keine Browser-Viewportprüfung und keine iPhone-/Safari-Liveprüfung durchgeführt; Hoch-/Querformat, geöffnetes iOS-Keyboard sowie Light-/Dark-Theme und reduzierte Bewegung wurden nicht live geprüft.
- Die Datenbankergänzung ist angewendet. Die statischen Bilder und die aktualisierte App-Zuordnung sind lokal vorbereitet und noch nicht veröffentlicht. Der App-Shell-Cache wurde auf v118 erhöht; die zuvor vorhandenen lokalen Änderungen an Bildladen und Bildcache wurden erhalten.

Annahmen: zwei Portionen pro Rezept, geschätzte Nährwerte pro Portion; „Kathriki“ entspricht Kritharaki aus Weizen. Beim Schlemmer-Filet wird Bordelaise mit 380 g für zwei angenommen; die konkrete Packungsanleitung geht vor. Produktreferenz: [iglo Schlemmerfilet à la Bordelaise](https://www.iglo.at/iglo-produkte/fisch/spezialitaeten/msc-schlemmerfilet-a-la-bordelaise).

Die Bilder wurden einzeln mit dem eingebauten Imagegen-Werkzeug erstellt. Vollständige Prompts und Dateizuordnung: `images/recipes/weeknight-image-prompts.json`.
