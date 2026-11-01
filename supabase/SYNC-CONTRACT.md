# Synchronisierung v1

Dieser Vertrag beschreibt die versionierten RPCs und den PWA-Client. Die RPCs
sind im verbundenen Supabase-Projekt installiert. Direkte Schreibzugriffe auf
die synchronisierten Haushaltstabellen sind für Clients gesperrt.

## Abgleich

`sync_household_v1` erhält `p_household_id` und `p_request_id` als UUID sowie
`p_base` (zuletzt bestätigter gemeinsamer Stand) und `p_local` (lokaler
Zielstand) als JSON-Objekte. Der Zustand enthält die Felder `dishes`, `plans`,
`pinnedMeals`, `pantryIngredients`, `restDays`, `shoppingChecks`,
`hiddenShoppingItems`, `manualShoppingItems` und `shoppingQuantities`.
Gerätespezifische Anzeigeeinstellungen gehören nicht zum Haushaltszustand.

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

## Prüfung

Die SQL-Tests prüfen synthetische Daten in zurückgerollten Transaktionen. Für
die Abnahme sind zusätzlich echte PWA-Sitzungen und Offline-Wechsel zu prüfen.
