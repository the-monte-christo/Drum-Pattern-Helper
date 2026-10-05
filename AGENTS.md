# AGENTS.md

Die Arbeitsanleitung für Coding-Agenten steht in [CLAUDE.md](CLAUDE.md) (Architektur, Befehle,
Konventionen, Stolperfallen, offene Punkte). Kurzfassung:

- `npm install`, dann `npm run dev` (API :3000 + Vite :5173)
- Vor jedem Commit: `npm test`; bei UI-Änderungen zusätzlich `npm run build && npm run test:e2e`
- UI-Texte, Kommentare und Doku auf Deutsch
- Pattern-Logik nur in `shared/pattern.js` (von Client und Server genutzt)
