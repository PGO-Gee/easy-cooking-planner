# Wochentisch

Eine kleine, statische Webapp zum Planen der Mahlzeiten für die Woche.

## Lokal starten

`index.html` über einen lokalen HTTP-Server öffnen.

## Anmeldung und Speicherung

Die App verwendet für die geschlossene Testphase E-Mail/Passwort-Login über Supabase Auth. Neue Konten werden nur im Supabase-Dashboard angelegt; öffentliche Registrierungen bleiben deaktiviert. Projekt-URL und Publishable Key stehen in `supabase-config.js`; diese Browserwerte sind öffentlich. Niemals einen Supabase Secret Key oder `service_role`-Key in die Website oder das Repository eintragen.

Gerichte und Wochenpläne bleiben in diesem ersten Schritt lokal im Browser gespeichert. Die Anmeldung synchronisiert sie noch nicht zwischen Geräten oder Haushaltsmitgliedern.

## Supabase-Datenbank

Die erste Migration liegt in `supabase/migrations/20261017_initial_schema.sql`. Sie erstellt private Haushalte, Gerichte, Wochenpläne, geplante Mahlzeiten und Einkaufslisten. Für neue Auth-Nutzer wird automatisch ein privater Haushalt angelegt; Row Level Security erlaubt Zugriff nur für Mitglieder dieses Haushalts. `supabase/migrations/20261019_restore_household.sql` stellt den Haushalt eines bestehenden Kontos wieder her, falls diese Einträge gelöscht wurden.

Die Datei wird im Supabase Dashboard unter **SQL Editor** ausgeführt. Anschließend stellt die App in einem separaten Schritt die bestehende lokale Speicherung auf diese Tabellen um.

`datenschutz.html` enthält einen Entwurf der Datenschutzerklärung. Vor einer Veröffentlichung müssen Verantwortlicher, Kontaktadresse und Supabase-Projektregion ergänzt sowie der Text geprüft werden.

## GitHub Pages

Das Projekt besteht aus statischen Dateien und kann direkt mit GitHub Pages veröffentlicht werden:

1. Im Repository unter **Settings → Pages** bei **Build and deployment** die Quelle **Deploy from a branch** auswählen.
2. Den Branch `main` und den Ordner `/(root)` auswählen und speichern.

Gerichte und Pläne werden im Browser der jeweiligen Person gespeichert. Es gibt noch keine gemeinsame Synchronisierung.

