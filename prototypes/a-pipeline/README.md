# Prototype A: Pipeline

A clickable prototype of a new Plato web app experience. It offers the same services as today's app, organised around **one board**. Every job is a card that moves left to right:

New match → Saved → Plato applying → Needs you → Applied

It runs on example data in the browser. There is no backend, nothing is sent anywhere, and every click is remembered in this browser only.

## What changed from today's app

| Today | Prototype A |
|---|---|
| 9 sidebar items (Home, Jobs, Applications, Job alerts, Career, Notifications, Extension, Profile, Messages) | 4 items: **Today · Jobs · Career · Me**, plus one **Ask Plato** |
| Home is a 12-chart dashboard | **Today** shows what needs you (finish it on the spot), what Plato is doing now, the best new matches, and 3 numbers |
| Jobs table → open a search → results → Applications page → Job alerts page | **Jobs** is one board for all of these. A search is a saved search with its own alert setting (daily / weekly / off) |
| The Apply button queues jobs as soon as the modal opens | Apply is a **confirmation**. It splits the jobs into "Plato applies", "needs Plato for Chrome" and "you submit it", shows the token cost, and does nothing until you confirm |
| Your details are spread over onboarding steps 2–4, Profile, Career and Extension. "Edit my details" opens the onboarding wizard | **Me** is one page: readiness meter, CV & experience, one skills list, preferences, application details, connections, and plan & tokens |
| 5 chat surfaces with separate histories | **One Plato**, one history. It knows which page and job you're looking at, and its replies have buttons that do the thing |
| 4-step onboarding whose last step claims work that never happened | 3 steps (CV → check what Plato understood → what you want). Finishing starts a real first search, and you watch it fill the board |
| Three interview flows and three skill stores | Career has three tabs: tailored **Resumes** with approve, **Interview practice** (text and voice, one history), and **Skills** gaps computed from your matches. Finishing a course adds the skill to Me |

Each screen has a purple **Design note** with the reasoning. Hide or show the notes from the **Prototype** menu (top right).

## Things to try (about 10 minutes)

1. **Today.** Answer Talabat's two questions from the card. The notice period you give is saved to Me, so the readiness meter goes up.
2. **Jobs.** Press "Apply to top N" in the New column. Read the confirmation, then confirm. Watch the cards move through *Plato applying* one at a time. Kraken stops in *Needs you* with a salary question.
3. Drag a card from New to Saved. Select several cards with their checkboxes and use the bar at the bottom.
4. **New search.** Type "Senior backend in Riyadh, hybrid", press Fill, then Start searching. Watch each job board report back and matches arrive.
5. Open a search chip. Change its alert to Weekly, edit it, or delete it.
6. **N26 (human check)** and **Noon (submit it yourself)** in Needs you show the two cases where Plato can't finish alone.
7. Open an *Applied* card. Look at the timeline and the proof of submission, then press "I got an interview". Go to Career → Interview practice and practise for that job.
8. **Ask Plato** (or press `/`): "What needs me?", "Apply to my top 3", "Find remote Node.js jobs from $5k". Open a job first, then ask "Should I apply?".
9. **Prototype menu → Start as a new user** to go through sign-up, the CV upload and the first search.

## Run it

```bash
npm install
```

```bash
npm run dev
```

`npm run build` writes `dist/index.html` (a single self-contained file you can open directly) and `dist/plato-pipeline.html` (the same app, formatted for publishing as a shared page).

## Code map

- `src/store.tsx`: all state, the actions behind every button, and the simulation that moves applications and searches along live.
- `src/data.ts`: example jobs, searches and profile.
- `src/screens/`:
  - `Today`, `Jobs` (board, list, searches)
  - `JobDrawer` (job detail and "needs you" forms)
  - `ApplyModal`, `FeedModal` (new or edit search)
  - `Career`, `Me`, `Plato` (assistant), `Onboarding`
- `src/notes.ts`: the design notes shown on each screen.
