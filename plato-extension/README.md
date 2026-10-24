# Plato Apply (Chrome extension)

MV3 side-panel extension that helps a person fill job applications **in their own browser**. The person always presses Submit. Every registered platform is enabled for filling (see `docs/PROVIDER_ACTIVATION.md`).

- `src/core`: provider-agnostic engine (API client, token store, outbox, orchestrator, reconcile).
- `src/providers`: provider contract + registry. Registrations only.
- `src/panel`: side panel UI. `src/background.ts`: restricts storage, opens the panel.
- Manifest: `permissions: [sidePanel, storage, tabGroups]` (tabGroups only to label Plato's tabs), no host permissions, no content scripts in production.

```
npm run build            # production flavor -> dist/production
npm run build:fixtures   # fixtures flavor (local fixture provider + probe), never shipped
npm test                 # unit + bundle tests
npm run test:runtime     # real Chromium against local servers only
```
`PLATO_WEB_ORIGIN` is the Plato web app (plain links in the wizard; dev default `http://localhost:3001`). The side panel is available on every tab.
`PLATO_API_ORIGIN` sets the one API origin (https, or localhost for development). The backend must set `EXTENSION_ORIGIN=chrome-extension://<id from extension-key.json>`.

The token is kept in `chrome.storage.local` restricted to trusted contexts. That is **not encryption**.
