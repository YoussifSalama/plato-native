# Plato brand palette

Taken from the logo (`plato-landing/public/logo.png`): a "P" filled with a gradient from deep cobalt to azure.
The same tokens are used in three places. If you change one, change all three:

- landing: `plato-landing/app/globals.css` (`:root`)
- web app: `plato-job-seeker-native-fe/app/globals.css` (`:root`, `.theme-app`)
- extension: `plato-extension/panel.css` (`:root`) and `src/content/overlay.ts`

## Brand

| Token | Hex | Use |
|---|---|---|
| Cobalt (primary) | `#005BA7` | Buttons, links, active states, focus rings. 6.9:1 on white. |
| Cobalt hover | `#004C8C` | Primary hover / pressed. |
| Cobalt deep | `#003A6E` | Gradient ends, dark accents. |
| Blue | `#0A6FC2` | Secondary text accents (5.2:1 on white). |
| Azure | `#00A1E2` | Gradient end, glows, fills. **Not for text on white** (2.9:1). |
| Sky | `#A9DCF7` | Accent text on night surfaces. |
| Cyan | `#7FE3FF` | Highlight in the hero gradient text. |
| Soft | `#E8F2FC` | Tinted backgrounds, chips, active nav. |
| Tint | `#F5F9FE` | Row hover, subtle wash. |
| Line | `#C9E0F5` | Borders on brand-tinted surfaces, card hover border. |

Brand gradient: `linear-gradient(135deg, #005BA7 0%, #0A7FD0 55%, #00A1E2 100%)`.

## Neutrals (cool navy-grey)

| Token | Hex |
|---|---|
| Ink | `#0E1B2C` |
| Ink 2 (secondary text) | `#4A5A70` |
| Ink 3 (tertiary text) | `#7A889C` |
| Mist | `#A3B0C2` |
| Paper (app background) | `#F5F8FC` |
| Line (borders) | `#E2E8F0` |
| Divider | `#EEF2F7` |

## Night (landing dark surfaces)

`#050B16` page, `#0A1424` raised, `#0E1B30` card. Hero glow: radial `#0B4F96` to `#08264C` to `#050B16`.

## Status

Success `#1C9A4B` / `#E3F9EA`, warning `#D97706` / `#FEF3C7`, danger `#F04438`, info `#0B7FAB` / `#E1F3FA`
(kept off the cobalt so it reads as a different thing), rose `#DB2777`, teal `#0D9488`.

Third-party marks (job-board tiles such as Ashby, LinkedIn) keep their own colors.

## Web app utilities

Defined in `plato-job-seeker-native-fe/app/globals.css`, taken from the landing page's cards:
`bg-brand-gradient`, `text-brand-gradient`, `glow-top`, `eyebrow`, `shadow-card`, `shadow-brand`, `card-lift`.
