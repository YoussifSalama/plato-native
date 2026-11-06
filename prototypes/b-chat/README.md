# Prototype B: Chat (AI-native)

Plato is the whole interface: one conversation runs the entire job hunt. Prototype A (`../a-pipeline`) stays as it is; B covers the same services with the AI in charge.

It runs on example data in the browser. There is no backend and nothing is sent anywhere.

## How it works

- **Opening the app.** Plato greets you ("Good evening, Ahmed. How are you today? How can I help?"), says what it did while you were away, and lists anything waiting for you.
- **`/` opens what Plato can do:**

  | Command | What it does |
  |---|---|
  | `/job-search` | Finds and ranks jobs for you |
  | `/build-resume` | Writes a resume for a specific job |
  | `/practice-interview` | Practice questions, with a score |
  | `/prove-skill` | Learn a skill and pass a quick check |
  | `/applications` | Where each application stands |
  | `/profile` | What Plato knows about you |

  The active mode shows as a chip in the composer. Press × on the chip to leave it.
- **No search form.** Plato asks one plain question at a time, each with suggested answers: what job, where, home or office, salary, anything to avoid. It skips whatever you already said. "I need an accounting job in Riyadh, ideally from home, around 18k riyals" fills four answers, and Plato only asks the last one. This works for an accountant or HR person as well as for engineers.
- **Everything arrives as cards in the chat:**
  - search progress, board by board
  - the top 3 jobs with "Tell me more / Apply / Save / Not for me"
  - an apply confirmation that splits the jobs into "I apply" and "you submit these yourself"
  - live application progress, plus questions Plato asks mid-application (your notice period, saved for every later form)
  - resumes, interview scores, and skill checks
- **Typing works too.** You can type anything, any time: "apply to the top 5", "my notice period is one month", "I want to practice an interview". Plato switches mode by itself.
- **The side panel** opens only for the long version: all results, the application tracker, the full resume, the profile.

## Things to try

1. Type `/` and pick **Search for jobs**. Answer by tapping, then start the search and watch the boards report back.
2. Say **Apply to the top 5 for me**. Confirm, then answer the notice-period question when Plato asks it mid-application.
3. Open **Prototype → Mona · senior accountant** and type: *I need an accounting job in Riyadh, ideally from home, around 18k riyals*.
4. `/practice-interview` → use "Show me a strong answer", then answer in your own words and get a score.
5. `/prove-skill` → pass the 3-question check. The skill joins your profile with proof.
6. **Prototype → Start as a new user** → send the CV in the chat. There are no sign-up forms.

## Run it

```bash
npm install
```

```bash
npm run dev
```

`npm run build` writes `dist/index.html` (opens directly) and `dist/plato-chat.html` (for publishing).

## Code map

- `src/engine.ts`: Plato's replies as pure functions. It handles modes, plain-language questions, understanding free text, and switching mode.
- `src/store.tsx`: state, card actions, and the live simulation (searches and applications).
- `src/personas.ts`: Ahmed (backend engineer) and Mona (senior accountant), with their jobs, skill gaps and interview questions.
- `src/screens/`: `Chat` (conversation, `/` menu, composer), `Cards` (every in-chat card), `Canvas` (side panel).
