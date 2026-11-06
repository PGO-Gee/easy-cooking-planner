# Synchronisierung v1 und v2

Dieser Vertrag beschreibt die versionierten RPCs und den PWA-Client. v1 ist im
verbundenen Supabase-Projekt installiert. v2 und die Katalog-RPCs werden durch
`20261103175353_recipe_cooking_catalog.sql` ergänzt und stehen nach Anwendung
dieser Migration bereit. Direkte Schreibzugriffe auf die synchronisierten
Haushaltstabellen sind für Clients gesperrt.

## Abgleich

`sync_household_v1` erhält `p_household_id` und `p_request_id` als UUID sowie
`p_base` (zuletzt bestätigter gemeinsamer Stand) und `p_local` (lokaler
Zielstand) als JSON-Objekte. Der Zustand enthält die Felder `dishes`, `plans`,
`pinnedMeals`, `pantryIngredients`, `restDays`, `shoppingChecks`,
`hiddenShoppingItems`, `manualShoppingItems` und `shoppingQuantities`.
Gerätespezifische Anzeigeeinstellungen gehören nicht zum Haushaltszustand.

Neue Clients verwenden `sync_household_v2` und
`resolve_household_conflict_v2`. v2 transportiert zusätzlich `recipe`,
`catalogSourceId` und `catalogSourceVersion` in jedem Gericht. Der Server prüft
die Rezeptform und schreibt diese Felder zusammen mit dem übrigen Gericht.
v1 bleibt verfügbar: Seine Antwort enthält weiterhin die bisherige
Gerichtsansicht, und sein Writer aktualisiert ausschließlich die alten
Gerichtsfelder. Rezept- und Herkunftsdaten bleiben dabei erhalten.

Die Antwort hat die Form:

```json
{
  "state": { "dishes": [], "plans": {}, "pinnedMeals": {}, "pantryIngredients": {}, "restDays": {}, "shoppingChecks": {}, "hiddenShoppingItems": {}, "manualShoppingItems": {}, "shoppingQuantities": {} },
  "revision": 0,
  "conflicts": []
}
```

Eine Anfrage-ID wird vor dem ersten Versand dauerhaft zusammen mit dem
vollständigen Inhalt gespeichert. Nach einem Verbindungsabbruch muss derselbe
Inhalt mit derselben ID wiederholt werden. Der Server gibt dann die ursprüngliche
Antwort zurück; eine Wiederverwendung mit anderem Inhalt oder durch ein anderes
Mitglied wird abgelehnt. Die Revision ändert sich nur, wenn sich der
Haushaltsstand ändert.

Wenn keine lokalen Änderungen anstehen, liest `read_household_v2` den
Haushaltsstand und seine Revision in einem Aufruf. Die Funktion prüft die
Mitgliedschaft, gibt `conflicts: []` zurück und schreibt keinen Eintrag ins
Request-Journal. Bei älteren Datenbankständen verwendet der Client weiterhin
die bisherige Synchronisierung. Schreibanfragen behalten ihre dauerhafte
Request-ID und ihr bisheriges Wiederholungsverhalten.

## Konfliktentscheidung

Ein Konflikt enthält `id`, `kind`, `key`, `label` sowie die Paare
`basePresent`/`baseValue`, `localPresent`/`localValue` und
`remotePresent`/`remoteValue`. Die Presence-Felder unterscheiden eine Löschung
von einem vorhandenen JSON-`null`. Beispiel:

```json
{
  "id": "quantity:[\"milch\"]",
  "kind": "quantity",
  "key": ["milch"],
  "label": "Menge: milch",
  "basePresent": true, "baseValue": 1,
  "localPresent": true, "localValue": 2,
  "remotePresent": true, "remoteValue": 3
}
```

`resolve_household_conflict_v1` erhält `p_household_id`, eine neue,
dauerhaft gespeicherte `p_request_id`, den vollständigen `p_conflict` und
`p_choice` (`local` oder `remote`). Die Antwort hat dieselbe Grundform wie beim
Abgleich. Wenn die erwartete Haushaltsfassung inzwischen geändert wurde, bleibt
sie unverändert und `conflicts` enthält den aktualisierten Konflikt. Auch eine
erneut kollidierende Abhängigkeit zwischen Gericht und Planung bleibt als
Konflikt erhalten.

v2-Konflikte verwenden dieselbe Gerichtseinheit, deren Wert zusätzlich die
Rezept- und Herkunftsfelder enthält. Der Client speichert die Sync-Version
zusammen mit jedem dauerhaften Request. Ausstehende v1-Requests und alte
Konflikte werden weiterhin über ihre ursprünglichen v1-RPCs wiederholt.

## Standardkatalog

`update_catalog_dish_v1` erhält die Katalog-ID, die erwartete Version und die
änderbaren Rezeptfelder. `create_catalog_dish_v1` nimmt dieselben Felder ohne
Katalog-ID an und erstellt ein neues Standardgericht. Beide Funktionen prüfen
Authentifizierung und zentralen Zugriffsmodus serverseitig. Beim Anlegen werden
eine Basis-Portionszahl, mindestens eine Rezeptzutat und ein Zubereitungsschritt verlangt;
doppelte normalisierte Namen werden als Duplikat zurückgegeben. Beim Bearbeiten
liefert ein Versionskonflikt den aktuellen Eintrag zurück und ändert nichts.
Direkte Schreibrechte auf `public.catalog_dishes` bleiben gesperrt. Die neue
Anlegefunktion steht nach Anwendung von
`20261103183928_create_catalog_dish_v1.sql` zur Verfügung.

## Prüfung

Die SQL-Tests prüfen synthetische Daten in zurückgerollten Transaktionen. Für
die Abnahme sind zusätzlich echte PWA-Sitzungen und Offline-Wechsel zu prüfen.
