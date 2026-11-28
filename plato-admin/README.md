# Plato Admin

Admin panel for Plato (Vite + React 19 + TypeScript + Tailwind v4). The API it talks to is
described in [`API_CONTRACT.md`](./API_CONTRACT.md) (routes under `/admin` on `plato-native-be`).

## Run

```bash
npm install
npm run dev        # http://localhost:5173, proxies /admin → http://localhost:3000
```

The proxy keeps the admin cookies same-origin in dev. Point it elsewhere with
`API_PROXY=http://localhost:4000 npm run dev`. App routes never start with `/admin`.

## Env

| Var | Meaning |
|---|---|
| `VITE_API_URL` | API origin baked in at build time, e.g. `https://api.example.com`. Empty in dev (same origin through the proxy). |

The backend must allow this panel's origin (`ADMIN_URL`) with credentials.

## Build and test

```bash
npm run build      # tsc + vite → dist/
npm test           # vitest (plan calculator)
```

## Docker

```bash
docker build --build-arg VITE_API_URL=https://api.example.com -t plato-admin .
docker run -p 8080:80 plato-admin
```

nginx serves `dist/` with an SPA fallback to `index.html`.
