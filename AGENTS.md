# Projektleitlinie

## UI: iPhone-first, Desktop weiterhin unterstützen

- Gestalte neue und geänderte Oberflächen zuerst für die Nutzung auf dem iPhone. Desktop bleibt eine unterstützte Ansicht und soll durch mobile Anpassungen nicht beeinträchtigt werden.
- Prüfe Layouts bei schmalen Viewports (ab 320 px), Hoch- und Querformat sowie bei geöffnetem iOS-Keyboard. Vermeide horizontales Scrollen und abgeschnittene Inhalte.
- Halte interaktive Ziele auf Touchscreens ausreichend groß (Richtwert mindestens 44 × 44 CSS-Pixel) und mit genügend Abstand. Interaktionen dürfen nicht von Hover abhängen.
- Berücksichtige iOS-Safe-Areas mit `env(safe-area-inset-*)`, insbesondere bei fixierten oder bildschirmfüllenden Elementen.
- Verwende für Formulareingaben auf iPhones mindestens 16 px Schrift, damit Safari nicht unerwartet zoomt. Halte Dialoge bei kleinen Viewports und mit geöffneter Tastatur erreichbar und scrollbar.
- Bevorzuge mobile Layouts mit klarer vertikaler Hierarchie und gut lesbarer Typografie. Verdichte Inhalte nicht so stark, dass Texte oder Bedienelemente schwer zu treffen sind.
- Prüfe bei jeder UI-Änderung Light- und Dark-Theme, wenn die betroffenen Komponenten beide unterstützen, sowie `prefers-reduced-motion` für Animationen.
- Nutze vorhandene Stylesheets und Gestaltungsmuster. Lege keine weiteren allgemeinen UI- oder Mobile-Stylesheets an, wenn die bestehende Struktur die Änderung aufnehmen kann.
- Berichte, welche Viewports und Zustände tatsächlich geprüft wurden. Behaupte keine iPhone-/Safari-Liveprüfung, wenn sie nicht stattgefunden hat.
