# Frontend

React 19 + TypeScript + Vite + Tailwind CSS.

```bash
npm install       # install dependencies
npm run dev       # dev server at http://localhost:5173 (proxies API to :8081)
npm run build     # production build → dist/ (served by Flask)
```

Built output is committed to `dist/` and served directly by the Flask backend — no separate Node process needed in production.
