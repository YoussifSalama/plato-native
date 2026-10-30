// Injected by esbuild `define` (scripts/build.mjs) and vitest (vitest.config.ts).
declare const __FLAVOR__: 'production' | 'fixtures';
declare const __ENGINE__: 'v2' | 'v3'; // which apply engine the panel runs (scripts/build.mjs --engine=)
declare const __AUTO_SUBMIT__: boolean; // Plato presses Submit itself once the form is ready (scripts/build.mjs --submit=off turns it off for live tests)
declare const __API_ORIGIN__: string;
declare const __WEB_ORIGIN__: string; // the Plato web app, for plain links only
declare const __BUILD__: string; // build time, shown in the panel so it is clear which version is loaded
