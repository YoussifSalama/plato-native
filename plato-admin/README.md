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
npm test           # vitest (plan calculator, count-up)
```

## Motion and card feel

Taken from the seeker web app (`plato-job-seeker-native-fe`: `app/globals.css` "Card feel",
`components/card-fx.tsx`, `lib/motion-system.ts`, `components/pill-tabs.tsx`), so both apps move alike.

- `src/index.css`, end of file: the card light and edge glow (every `.card`), `card-lift` (clickable cards
  lean toward the pointer), `enter` / `stagger` (rise in, 70 ms apart), `skeleton`, `bar-grow`, dialog and
  drawer transitions. Entrances animate `translate`/`opacity`, never `transform` (the lean owns it).
- `components/CardFx.tsx`: one pointer listener for the app (mouse and pen only, one frame at a time).
- `components/CountUp.tsx`: KPI numbers count up (`$`, decimals, `%` kept); `lib/countUp.ts` is tested.
- `lib/motion.ts`: the seeker app's springs and curves. Sliding pills (tabs, sidebar) use `motion`'s
  `layoutId` through `m.*` components; the engine loads after first paint (`MotionProvider`, LazyMotion strict).
- Reduced motion: nothing moves (CSS media query, `MotionConfig reducedMotion="user"`, charts and count-up
  check it). Touch screens get no pointer light.

## Docker

```bash
docker build --build-arg VITE_API_URL=https://api.example.com -t plato-admin .
docker run -p 8080:80 plato-admin
```

nginx serves `dist/` with an SPA fallback to `index.html`.
