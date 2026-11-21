# Career Hub: plan and sprints

Target: the Career page from the owner's screen (all tests and practice in one place, a readiness bar per target role, a "Prep for an interview" panel, "Continue where you left off"), plus the test types that do not exist yet: real aptitude tests, games, an English level test and skill tests per profession.

How it gets built: the owner drives Claude Code session by session (structure, data design, prompts) and reviews; Claude Code writes the code. So the slow part is not typing code. It is checking that questions are correct, reading licences, playing the games to tune them, and testing in the real app.

How to comment: every section ends with a **Comments** line. Write under it, or refer to an item by its id (S2.3, D4…).

---

## 1. What already exists

Everything below is live code. The hub mostly gathers it; it does not rebuild it.

| Area | What exists | Where | Gap |
|---|---|---|---|
| Interviews | General, for a Plato job, salary negotiation, case, pitch, business English; written and voice; results | `app/(app)/career/interviews/*`, `plato-native-be/src/modules/interview` | Not shown as cards in one catalogue |
| Aptitude | Matrix reasoning: 11 timed sets from the Open Matrices Item Bank (220 items, IRT scoring, percentile) | `quizzes/assessments/*`, `plato-native-be/data/assessments/omib.json` | Numerical and logical are only chat prompts (the AI writes the questions on the fly), so they are not real tests. No verbal or critical thinking |
| Personality | Six IPIP inventories: Big Five (full and quick), workplace style, role potential, integrity, emotional intelligence | `data/assessments/ipip.json` | None |
| Skills | Company quiz builder (with a shared library), proof-of-skills challenge, skills gap with courses | `career/quizzes`, `career/proof`, `career/skills` | No skill test per profession (Excel for an accountant, SQL for a backend developer…) |
| Resume | Score, build, tailor (through the career coach) | `lib/career-hub/catalog.ts` | None |
| Games | Nothing | | All of it |
| Language | Business English interview only | interviews | No level test |
| Candidate profile | Reasoning, Big Five, recruiter-style report | `career/quizzes/profile` | Will later take games and language results |

Data today (`plato-native-be/prisma/schema/quizzes.prisma`): `Quiz`, `QuizLibrary`, `QuizAttempt`, `AssessmentAttempt`, `CandidateReport`; `MockInterview` for interviews. An attempt is saved only when it is finished, so nothing records an unfinished attempt yet.

**Comments:**

---

## 2. Decisions already made (change any of them here)

| # | Decision | Why |
|---|---|---|
| D1 | No new attempts table: every new test type is saved in `AssessmentAttempt` with a slug prefix: `apt-`, `game-`, `lang-`, `skill-` | One history, one results screen, one profile |
| D2 | Add `status` (in_progress / done) and `progress Json?` to `AssessmentAttempt` | "Continue where you left off" needs unfinished attempts |
| D3 | One new collection, `PracticeItem`, for AI-written questions that passed verification (verbal, language, skill MCQs): kind, skill, level, payload, verified, reports | AI items are reused for every seeker, are checked once, and can be reported |
| D4 | No AI-written question reaches a seeker unless a second, independent model solved it and both agreed | The AI makes confident mistakes; a wrong answer key ruins a test |
| D5 | Numerical and logical questions come from code templates: the numbers are random, the answer is computed by code | No hallucinated answer keys at all |
| D6 | ICAR is not used | Its licence is non-commercial (scientific use only) |
| D7 | Games are our own design built on standard cognitive tasks; jsPsych (MIT) is a reference, not a dependency | Same science, our look, no copying of a known game |
| D8 | No percentile against "people" until there is real data: games compare with the seeker's own past attempts; a Plato percentile appears after about 200 attempts per game | There is no calibration sample for games; inventing norms would be false |
| D9 | The English result says "practice estimate (B2)", never a certificate | It is not a validated exam |
| D10 | Skills come from the profile plus the target role, mapped to ESCO / O*NET (both CC BY 4.0, with attribution) | Open, large, multilingual (ESCO) and maintained |
| D11 | Every test uses the existing test frame (`career/quizzes/_ui/shell.tsx`): action bar at the bottom, navigator on the side | One look, already approved |

**Comments:**

---

## 3. Sources and licences

| Source | Used for | Licence | Status |
|---|---|---|---|
| Open Matrices Item Bank | Matrix reasoning (exists) | GPL-3.0 | In use |
| IPIP | Personality (exists) | Public domain | In use |
| jsPsych + jspsych-contrib | Reference for Corsi, n-back, task switching | MIT | To read |
| Open CEFR dataset | English grammar / vocabulary items | Says MIT + CC BY 4.0 | **Check the LICENSE file before use** |
| CEFR descriptors (Council of Europe) | Rubric for writing and speaking | Free to use | To read |
| ESCO | Skills taxonomy | CC BY 4.0 (the page also mentions CC BY-SA) | **Confirm which one applies** |
| O*NET 31 | Skills per occupation, crosswalk to ESCO | CC BY 4.0 | OK |
| PGlite | SQL practical tests in the browser | Apache-2.0 / PostgreSQL | OK |
| HyperFormula | Excel-like formulas | GPL-3.0 or commercial | **Avoid**: use an MIT alternative or a small own evaluator |
| ICAR | — | Non-commercial | Not used (D6) |

Every bank we add goes into `plato-native-be/data/assessments/README.md` with its source and licence, as OMIB and IPIP are today.

**Comments:**

---

## 4. Sprints

One sprint is about a week: two to four days of building with Claude Code, then review and testing. Total: about six weeks of calendar time. Sprints 2, 3 and 4 do not depend on each other and can be reordered.

### Sprint 0: Foundation (2 to 3 days)

| Id | Item |
|---|---|
| S0.1 | Add a "Career conventions" section to `CLAUDE.md` so every session follows the same rules (sources and licences, pure scoring with tests, D4, D11, one card size, responsive) |
| S0.2 | Data changes: D1, D2, D3. Schema diff reviewed before any code |
| S0.3 | `GET /career/catalog`: one registry of every practice item (type, tab, minutes, level, link), served to the web |
| S0.4 | `GET /career/progress`: unfinished attempts and the readiness numbers per role |

Done when: schema pushed locally, both endpoints return real data from the existing tables, tests green.

Owner: review the schema (it is the costly-to-undo part).

Prompt to start:
```
Read plato-native-be/prisma/schema/quizzes.prisma and src/modules/quizzes. Design the data for the Career hub:
reuse AssessmentAttempt for every new test type (slug prefixes apt-, game-, lang-, skill-), add status + progress
for unfinished attempts, and one PracticeItem collection for AI-written items that passed verification.
No other new models. Then a catalogue registry (GET /career/catalog) and GET /career/progress.
Show me the schema diff and the endpoint shapes before writing code.
```

**Comments:**

### Sprint 1: The Career page (about 1 week)

| Id | Item |
|---|---|
| S1.1 | "All tests and practice": tabs All / Interviews / Aptitude / Games / Personality / Skills / Language / Resume, search, 6 per page, one card size. Tabs with nothing yet (Games, Language) show a proper empty state, not a lone card |
| S1.2 | Readiness bar: "How ready you are for <role>" with the roles from preferences; Resume score, interview practice (n of 3), aptitude, English |
| S1.3 | "Prep for an interview" panel: tabs "A job on Plato" (exists: job picker), "Any other job" (paste a posting), "Interview email" (paste the invite; the AI pulls company, role, date, format), then Practice interview / Likely questions / A test like theirs (company quiz builder) |
| S1.4 | "Continue where you left off" from S0.4, plus the resume quick-fix card |

Done when: the page matches the screen at desktop and phone width, every card opens a real flow, no dead links.

Owner: compare with the screen; check the readiness numbers make sense for your own account.

**Comments:**

### Sprint 2: Aptitude (about 1 week)

| Id | Item |
|---|---|
| S2.1 | Numerical reasoning: tables and charts with generated numbers, answers computed in code (D5). Several difficulty levels, timed |
| S2.2 | Logical reasoning: number and letter series, rule deduction, generated by code (D5) |
| S2.3 | Verbal reasoning and critical thinking: the AI writes a passage and True / False / Cannot say statements; a second model solves them; only agreed items are kept in `PracticeItem` (D3, D4) |
| S2.4 | Results like the matrix tests: score, time, which kinds of question went wrong |

Done when: each test has at least 3 sets, scoring is tested, items pass verification.

Owner: answer one set of each yourself; review a sample of 30 verbal items.

**Comments:**

### Sprint 3: Games (about 1 week)

| Id | Item | Measures |
|---|---|---|
| S3.1 | Attention switch (task switching) | Switch cost, accuracy |
| S3.2 | Pattern memory (Corsi blocks) | Memory span |
| S3.3 | Route planner (Tower-of-London style) | Planning, extra moves |
| S3.4 | N-back | Working memory |
| S3.5 | Go / no-go | Impulse control |
| S3.6 | Digit span | Short-term memory |

Each: our own visual design, mouse and touch, a short practice round, scoring in pure functions with tests, results compared with the seeker's own past attempts (D8).

Done when: all six play on desktop and phone, results saved and shown.

Owner: play every game several times; tune speed and difficulty. This is the step that needs a person.

**Comments:**

### Sprint 4: Language (about 1 week)

| Id | Item |
|---|---|
| S4.1 | Grammar and vocabulary, adaptive (gets harder or easier with the answers). Items from Open CEFR if its licence checks out, else AI items through D4 |
| S4.2 | Reading: short texts with questions, A2 to C1 |
| S4.3 | Listening: the same, read aloud by text-to-speech |
| S4.4 | Writing: one short task, scored by the AI against the CEFR descriptors |
| S4.5 | Speaking: on the existing voice interview, scored against the CEFR descriptors |
| S4.6 | Result: an estimated level per skill and overall, labelled as a practice estimate (D9) |

Done when: a full test takes under 30 minutes and gives a level.

Owner: take it yourself; review a sample of items; check the speaking score on a real recording.

**Comments:**

### Sprints 5 and 6: Skills by profession (about 2 weeks; the biggest content job)

| Id | Item |
|---|---|
| S5.1 | Skill mapping: profile skills plus target role, mapped to ESCO / O*NET skills (D10) |
| S5.2 | Pick the first skills: the 20 most asked for in the jobs collection |
| S5.3 | MCQ tests per skill from verified `PracticeItem`s (D3, D4), three levels each |
| S5.4 | Seekers can report a wrong question; reported items are pulled until checked |
| S6.1 | Practical SQL test: a small database in the browser (PGlite); the answer is graded by comparing the query's result with the expected one |
| S6.2 | Practical Excel test: a small formula grid (no GPL engine, see section 3) |
| S6.3 | The Skills tab shows the tests that match the seeker's profile first |

Done when: the first 20 skills each have a test, SQL and Excel practicals work.

Owner: review question samples per skill (this is most of the work); decide the first professions (see question Q1).

**Comments:**

### Sprint 7: Finish and launch (2 to 3 days)

| Id | Item |
|---|---|
| S7.1 | Candidate profile takes aptitude, games (if Q2 says so) and language results |
| S7.2 | Tours for the new screens, like the rest of the app |
| S7.3 | One pass for phone layout, empty states and loading states across every new screen |
| S7.4 | Usage and cost check: which steps call the AI and what they cost per seeker |

**Comments:**

---

## 5. Open questions for the owner

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Skills: start with the 20 most asked skills in our jobs, or with chosen professions first (accountants, backend developers…)? | The 20 most asked |
| Q2 | Games: show them on the candidate profile a recruiter sees, or keep them as practice for the seeker only? | Practice only, until there is real data (D8) |
| Q3 | Does anything here cost the seeker credits (like the candidate report today)? | AI-scored parts (writing, speaking, interview email) use credits; fixed tests are free |
| Q4 | Arabic versions of any test? | English only for now |

**Comments:**

---

## 6. What Claude Code will not do for you

- Decide that a question is correct: it builds the verification, a person samples the results.
- Make the final licence call: it reads the LICENSE files; the decision is yours (ESCO, Open CEFR).
- Tune how a game feels: someone has to play it.
- Produce real percentiles: those need real seekers, after launch.
