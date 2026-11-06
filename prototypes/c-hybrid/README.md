# Prototype C: Copilot (A + B)

Prototype C combines A's pages with B's AI-native conversation:

- From **B**, Plato is the front door. The home page is a conversation: Plato greets you, `/` opens every mode, and job search is a plain-language chat with suggested answers instead of a form.
- From **A**, the **Jobs** board, **Career** and **Me** pages stay, for when you'd rather look and click than talk.
- **Plato is docked beside every page**, in the same conversation, and knows which page you're on. The two stay in sync:
  - Anything you do on a page shows up in the chat. For example, applying from the board posts the progress to Plato.
  - Anything Plato does moves the cards on the board live.

It runs on example data in the browser. There is no backend and nothing is sent anywhere.

## How the two halves connect

| On a page (A) | With Plato (B) |
|---|---|
| Board: drag, select several, "Apply to top N", confirm | "Apply to the top 5 for me" in chat |
| Answer the question an application is waiting on, right on the card or in Today | Plato asks the same question in the chat. One answer unblocks every application waiting on it |
| "New search with Plato" / "Change with Plato" | The search conversation opens beside the board, and results land on the board |
| Career: "Learn & prove Kafka", "Practice with Plato" | Plato starts already knowing the skill or job |
| Job details: "Write a resume for this job", "Practice its interview", "Ask Plato" | Plato skips the "which job?" question |
| Me: type your notice period | Or say "my notice period is one month" |

## Things to try

1. **Plato** (home): type `/` and pick *Search for jobs*. The Today column on the right shows what needs you and what Plato is doing.
2. **Jobs**: press "Apply to top N", confirm, then press **Show Plato**. Watch the cards move while Plato reports in the chat. When an application asks for your notice period, answer once on any card.
3. **New search with Plato**: answer in the side chat, then watch the new search's matches fill the board.
4. Open a job → **Practice its interview** or **Write a resume for this job**.
5. **Career** → *Learn & prove* a skill → pass the check. It becomes "Proven" on Career and Me.
6. **Prototype → Mona · senior accountant** to see the same app for a non-technical job.

## Run it

```bash
npm install
```

```bash
npm run dev
```

## Code map

Built on B's engine:

- `src/engine.ts`: conversation, modes, and page context hints.
- `src/store.tsx`: state, page actions that are logged in the chat, and the live simulation.
- `src/personas.ts`: the two example people and their data.

New in C:

- `src/derive.ts`: where each job sits on the board.
- `src/screens/Jobs.tsx`: the board.
- `src/screens/Pages.tsx`: Career, Me, and the Today panel.
- `src/screens/Overlays.tsx`: job details, apply confirmation, and the resume viewer.
- `src/App.tsx`: the side rail and the docked Plato.
