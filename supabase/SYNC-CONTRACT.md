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

## Rezeptart

Die Migration `20261107203423_baking_recipe_type.sql` erweitert den v2-Gerätezustand um `type` (`meal` oder `baking`) und die Katalogeinträge um `recipe_type`. Fehlende Werte werden als `meal` behandelt; ältere v1- und v2-Writer erhalten die gespeicherte Rezeptart, wenn sie kein `type` senden. Die Migration muss vor der zugehörigen App-Version bereitgestellt werden.

## v3: Haushaltsportionen und Kochblöcke

Neue Clients verwenden `read_household_v3`, `sync_household_v3` und
`resolve_household_conflict_v3` mit denselben Argumenten und Antwortfeldern wie
v2. Der Zustand enthält zusätzlich:

- `planningSettings`: `configured`, `adults`, `children`, `childFactor`, `mode`
  (`self`, `household`, `custom`), `portions` und `days` (1–7).
- `cookingEntries`: Objekt mit stabiler Eintrags-ID als Schlüssel. Jeder Wert
  enthält `id`, `dishId`, `date`, `position`, `portions` (pro Esstag), `restDates`
  und `pinned`. Die Gesamtkochmenge ist `portions × (1 + restDates.length)`.
- `quantityOverrides`: positive Mengen unter einem JSON-Array als Stringschlüssel
  `[Einkaufswochen-Montag, normalisierter Zutatenname, normalisierte Einheit]`.

`plans`, `pinnedMeals` und `restDays` bleiben die Kalenderprojektion. Einträge
werden serverseitig gegen diese Projektion geprüft. Ohne gespeicherte Metadaten
entstehen deterministische IDs `legacy:Datum:Position:Rezept-ID`; Portionen
entsprechen den Rezept-Basisportionen, ersatzweise 2 bei unbekannter Basis.
Unbekannte Rezeptmengen werden trotzdem nicht als berechenbar behandelt.

Kalenderprojektion und sämtliche Kochblöcke bilden gemeinsam die atomare
Merge-Einheit `cooking-plan:[]`. Auch Änderungen an verschiedenen Tagen können
also einen gemeinsamen Konflikt auslösen. Das ist bewusst konservativ, damit
Verschiebeketten über mehrere Wochen niemals teilweise übernommen werden.
`planning-settings:[]` wird getrennt abgeglichen, Mengenkorrekturen je Schlüssel
als `quantity-override`. Zutatenbedarf wird aus Rezept und Block abgeleitet und
nicht zusätzlich persistiert.

Die Zusatzdaten liegen in `wochentisch_private.cooking_state`, ohne direkte
Clientrechte. Die öffentlichen Wrapper prüfen Haushaltsmitgliedschaft über die
bestehenden Transaktionshilfen beziehungsweise beim Lesen. Einstellungen ändern
die Haushaltsrevision und lösen über `households.updated_at` einen Realtime-Abgleich
aus. Die Migration ergänzt diese Tabelle in der bestehenden Veröffentlichung.

v1/v2 bleiben für gespeicherte Anfragen und Konflikte verfügbar. Nach dem ersten
v3-Schreiben werden ältere Änderungen an Plan, Restemarkierungen und alten
Mengenwerten mit einem Update-Hinweis abgelehnt; reine unveränderte Wiederholungen
bleiben im Request-Journal idempotent. Neue v3-Anfragen normalisieren ältere
Ausgangsstände. Ein abgelehnter alter Schreibrequest bleibt zur Datensicherung
lokal erhalten und wird nicht stillschweigend als erfolgreich behandelt.

Wird ein noch nicht bestätigter v1/v2-Sync nach der v3-Aktivierung abgelehnt,
legt der neue Client vor dem Versand eine separate normalisierte v3-Anfrage mit
neuer ID dauerhaft ab. Die ursprüngliche Anfrage bleibt bis zur gemeinsamen
Bestätigung erhalten. Auch nach einem Neustart wird dieselbe v3-Anfrage
wiederholt; zurückgegebene Konflikte werden über v3 aufgelöst. Alte gespeicherte
Konfliktentscheidungen behalten ihre ursprüngliche API-Version und werden bei
geschützten Änderungen weiterhin explizit abgelehnt.
