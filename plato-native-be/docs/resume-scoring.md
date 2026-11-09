# Resume scoring

Plato gives two scores, both 0-100. Fixed rules compute them in
`src/modules/resume/resume-score.ts`. The model that writes the resume never
sets the score, so it can't be talked up, and the same resume always gets the
same number.

## Quality score: the master resume on its own

`scoreProfile`. Shown in Career as "Resume 86/100" and in Profile → Resumes. The
career agent reads it with `score_resume`.

| Category | Points | Rule |
|---|---|---|
| Contact and sections | 15 | Contact details: name, email, phone, city, LinkedIn. Sections present: headline, summary, experience, skills, education. Dated roles, newest first. |
| Numbers and results | 25 | Full credit when half the bullets have a number (%, money, users, time). |
| Action verbs and style | 15 | Bullets open with a strong verb. No "I/my". No filler words. |
| Length and bullets | 10 | 3-6 bullets on each of the last two roles. Bullets of 8-30 words. |
| Headline and summary | 10 | The headline reads like a title. The summary is 30-80 words. |
| Skills backed by experience | 15 | 8-25 skills, with at least half also shown in experience or projects. |
| Experience | 10 | Every role has a title and company. Each gap over 6 months is flagged (-2.5). |

## Match score: one resume against one job

`scoreMatch`. Shown on Jobs → Tailor & apply, and returned by `build_resume`
when a job was given.

| Category | Points | Rule |
|---|---|---|
| Job keywords | 50 | The ATS keyword report (`resume-ats.ts`). Requirements count double. |
| Job title | 15 | The headline mirrors the job title (when the profile supports it), or overlaps with the latest title. |
| Shown in your experience | 15 | A matched term that appears only in the skills list gets 70% credit. |
| Recent experience | 10 | Matched terms appear in the last two roles. |
| Resume quality | 10 | The quality score divided by 10. |

Keywords alone can't reach 100, because the categories cap each other.

## Bands and thresholds

| Band | Score |
|---|---|
| Strong | 85+ |
| Good | 75-84 |
| Fair | 60-74 |
| Needs work | below 60 |

What happens with a job resume, by match score:

- **75+, `send`:** Plato may send it.
- **65-74, `confirm`:** the seeker checks it first.
- **Below 65, `hold`:** "Approve all" leaves it out. The seeker approves it on its own or uses their original.
- **Master resume below 70:** Plato says it needs work before applying widely.

## Where the numbers come from

They come from research done in November 2026. All of them are vendor rules of
thumb, not validated cut-offs.

- **Jobscan:** recommends a 75% match rate, and says "many see success at 65%".
  It ranks hard skills and job title highest. Its own data links a title match
  with far more interviews (a correlation).
- **Resume Worded:** calls 85+ good. Its checks are weighted (impact, brevity,
  style), not averaged.
- **Ladders eye-tracking study:** recruiters skim for about 6-7 seconds and read
  titles, companies, dates and education first. This is why title, dates and
  sections carry weight.
- **ATS behaviour:**
  - Real ATSs reject automatically through knockout questions the employer sets.
    Plato handles those in apply eligibility, not in this score.
  - Recruiters then search and filter by title, location and skills.
  - The "75% of resumes are rejected by ATS" claim is a 2012 sales pitch with no
    study behind it.
- **HBS "Hidden Workers":** rigid filters on gaps over 6 months exclude qualified
  people. That is why a gap is flagged and only lightly penalised.

## Rules

- **The score is Plato's estimate, not an employer's verdict.** Never say a
  resume "passes an ATS".
- **Never add a skill or keyword the seeker doesn't have to raise the score.** A
  missing requirement is a gap to discuss.
- **Recalibrate later.** Seekers can mark replies on sent applications (Viewed,
  Interview, Offer). After a few hundred applications, compare the interview
  rate by score band and move the thresholds if the data says so.
