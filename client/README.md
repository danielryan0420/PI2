# Frontend

React 19 + TypeScript + Vite + Tailwind CSS.

```bash
npm install       # install dependencies
npm run dev       # dev server at http://localhost:5173 (proxies API to :8081)
npm run build     # production build → dist/ (served by Flask)
```

Build output goes to `dist/` (gitignored, built on setup/update) and is served directly by the Flask backend — no separate Node process needed in production.
