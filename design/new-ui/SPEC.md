# Plato new UI: design spec (working draft)

Source of truth for the redesign of the job seeker web app (`plato-job-seeker-native-fe`)
and the Plato Apply extension popup. Built from the screens in `screens/`. This draft is
updated as more screens arrive and nothing is implemented until it is approved.

| # | Screen | Route |
|---|---|---|
| 01 | Onboarding, step 1: Documents | `/onboarding/documents` |
| 02 | Onboarding, step 2: Preferences | `/onboarding/preferences` |
| 03 | Onboarding, step 3: Connect Plato Apply | `/onboarding/connect` |
| 04 | Extension popup: connect with code | `plato-extension` panel |
| 05 | Home (signed in) | `/` |
| 06 | Jobs: all jobs list with saved searches | `/jobs` |
| 07 | Jobs: review tailored resumes | `/jobs/review-resumes` |
| 08 | Applications: table with "Needs you" rows inline | `/applications` |
| 09 | Applications: table plus a "Needs you" side column (alternative layout) | `/applications` |
| 10 | Following | `/following` |
| 11 | Career | `/career` |
| 12 | Profile | `/profile` |

Images: `screens/NN-<name>.jpg`, numbered as in this table.

## 1. Direction

- **Flat and calm, not glass.** White cards with a 1px cool border sit on a pale paper
  background. There's no blur or translucency and almost no shadow. This replaces the
  "spatial glass" surfaces (commits `aa44636`, `604d1ce`).
- **The palette doesn't change.** Every color in the screens maps to existing `BRAND.md`
  tokens (cobalt primary, navy ink, success green, warning amber).
- **Plato talks to the user.** A recurring "Plato says" block (small P badge, soft blue
  panel) explains what Plato did or knows: "Plato read your CV", the salary range hint,
  why a job matches. It's a core pattern, not decoration.
- **Copy is plain and reassuring.** Every step says why it's asked ("so Plato never has
  to stop and ask you mid-application").

## 2. Tokens

### Color (all existing)
| Role | Token | Hex | Seen in |
|---|---|---|---|
| Page background | new `--paper` | ~`#F3F6FA` | All web screens |
| Card | `--card` | `#FFFFFF` | Cards, inputs |
| Card border | `--border` | `#E2E8F0` | Cards, inputs, outline buttons |
| Primary / action | `--primary` | `#005BA7` (renders ~`#0A57B5`) | Primary buttons, selected chips, links, progress |
| Plato panel bg | `--primary-tint` / `--primary-soft` | `#F5F9FE` / `#E8F2FC` | "Plato read your CV", salary hint, stat highlight |
| Plato panel border | `--primary-line` | `#C9E0F5` | Same panels, CV code inputs |
| Removable chip bg | `--primary-soft` | `#E8F2FC` | Job titles, locations, companies |
| Ink | `--foreground` | `#0E1B2C` | Headings, body |
| Secondary text | `#4A5A70` | | Descriptions |
| Tertiary text | `#7A889C` | | Hints, timestamps, "(optional)" |
| Success | `--success` / `--success-soft` | `#1C9A4B` / `#E3F9EA` | Uploaded CV card, "Added" doc card, check tiles |
| Warning | `--warning` | | Applications count badge in sidebar |
| Danger soft | rose/red soft | | Active "avoid" chip (Commission-only pay) |
| Notification dot | `--destructive` | `#F04438` | Bell |

> Note: `--text-secondary` is `#0E1B2C` on pre-login pages today. The new screens use a real
> grey (`#4A5A70`) for descriptions there too, so that override goes.

### Type
- Family: **Plus Jakarta Sans** (already loaded). Headings are bold with tight tracking (~-0.02em).
- Mono eyebrows: **Geist Mono**, uppercase, wide tracking (~0.12em), tertiary color.
  Examples: `STEP 1 OF 3 · DOCUMENTS`, `SATURDAY, 7 NOVEMBER`.
- Small caps label: `PLATO READ YOUR CV` is sans, semibold, uppercase, primary color.

| Style | Size / weight | Example |
|---|---|---|
| Display | 40px / 700, lh 1.1 | "Give Plato everything an application might ask for" |
| Page title (app) | 32px / 700 | "Good evening, Raef" |
| Section title | 20px / 700 | "Top matches for you", "Your applications" |
| Card title | 16-17px / 600 | "Cover letter", job title |
| Body | 16px / 400 | Descriptions |
| Small | 14px / 400 | Card subtitles, meta |
| Micro | 12-13px | Stat labels, timestamps |

### Shape and spacing
- Card radius **16px**. Inner tiles and inputs **10-12px**. Buttons **10-12px**. Chips are **pills**.
- Card padding 20-24px. Grid gap 12-16px. Section gap 24-32px.
- Borders 1px. Elevation is basically none; the home cards might have a 1-2px soft shadow.
- Control heights: buttons 44-48px (large CTAs 52-56px), inputs 44px, chips 36-40px.

## 3. Components

| Component | Variants / notes | Maps to |
|---|---|---|
| **Button** | `primary` (solid cobalt, white text, optional trailing →); `outline` (white, border, ink text: Back, Replace, Add to Chrome); `outline-primary` small (+ Add, Added, primary text); `link` (Skip for now, See all 122 →) | `components/ui/button.tsx` |
| **Step header** | Logo left; right side has a mono eyebrow `STEP n OF 3 · NAME` and 3 bar segments (filled = primary) | `onboarding-layout.tsx` (rewrite) |
| **Plato says panel** | P badge + text on `primary-tint` with a `primary-line` border. Optional uppercase label. Inline form (P badge + one line) for the job card reason and the preferences headline | new `components/plato-note.tsx` |
| **File row (uploaded)** | Success-soft card: check tile, filename, a green meta line, Replace button | new |
| **Document tile** | Icon tile (primary-soft square), title + subtitle, `+ Add` button. Done state: success-soft background and border, check icon, "Added" | new |
| **Info row** | Lock icon + muted text in a bordered card (privacy note) | new, small |
| **Chip: removable** | primary-soft background, primary text, × | `tag-input.tsx` |
| **Chip: selectable** | Pill; off = white with border and ink text; on = solid primary, white text. Single or multi select | `toggle-group.tsx` |
| **Chip: suggestion** | Dashed border, `+ Label`; turns into a danger-soft chip once added (avoid list) | new variant |
| **Field: label-left row** | Label left, select right, divider between rows ("Answers for your applications") | new layout of `field.tsx` |
| **Input / Select** | White, 1px border, 10px radius. Focus = 2px primary border | `input.tsx`, `select.tsx` |
| **Numbered steps card** | Number in a primary-soft circle, title + description, action on the right or below, divider between steps | new |
| **Code input** | 6 boxes split 3-3 with a dash; primary-tint fill, primary-line border | extension `panel` |
| **Stat tile** | Big number + label, bordered; highlighted version on primary-soft; ring variant (12/20 goal) | new |
| **Match ring** | Circular % ring, primary | new |
| **Job card** | Company monogram tile, match ring, title, company, meta chips (grey), Plato reason line, full-width Apply + square bookmark button | `jobs/components` |
| **List row** | Monogram tile + text (bold entity) + right meta (time or % pill), divider | new |
| **Sidebar nav** | Logo; items with icon + label; active = white card with border; count badge (primary-soft "18 new", warning circle "1"); Profile strength card pinned at the bottom | `app-shell.tsx` |
| **Top bar** | Command bar ("Tell Plato what to do…", `Ctrl K`), agent status pill (dot + "Plato · applying 3 of 10"), token pill, bell, avatar | `app-shell.tsx`, `command-palette.tsx` |
| **Segmented progress** | Three-part bar (sent / viewed / interview), increasing primary intensity | new |

## 4. Flow (so far)

```
signup/login → verify email
  → /onboarding/documents   (CV required, other docs optional; Plato reads the CV and summarizes)
  → /onboarding/preferences (prefilled from the CV; live "~310 open jobs" estimate)
  → /onboarding/connect     (install extension → get code → paste in extension; skippable)
  → /  Home
```

Extension: popup "Connect to your Plato account" → paste code, or "Get my code from Plato"
opens the web app with the code ready to copy (same flow as step 3, step 2).

### Changes from today's onboarding
Today it's `?step=1..4`: build-profile → confirm-information → preferences → ready.
New version:
- **3 steps with real routes** (`/onboarding/documents|preferences|connect`) in place of a query param.
- **No separate "confirm information" step.** The CV summary sits inline on step 1 and
  the details get edited later in Profile.
- **Preferences grows a lot:** salary (expected, minimum, negotiable), application answers
  (notice period, visa, relocation, travel, start date), things to avoid, and
  companies you'd love to work for.
- **"Ready" becomes "Connect Plato Apply".** The extension is part of onboarding now.
- The onboarding assistant/FAQ side panel doesn't appear in the new screens, so it's still an open question.

### Home: what changes
- Greeting header card with a date eyebrow and 4 stat tiles (new matches, applications sent,
  interviews, weekly goal ring).
- Top matches: 3 job cards with a Plato reason line.
- Your applications: a funnel bar and a recent activity list.
- Companies you follow are hiring: a list with match % pills.
- Sidebar now has **Home, Jobs, Applications, Following, Career**. "Following" is new.
  Insights, Messages, Notifications, Tokens and Extension aren't in the nav anymore
  (they move to the top bar, bell, avatar menu or command bar). This needs confirming.

## 5. Signed-in screens (06-12)

### Shared app shell (all signed-in pages)
- **Sidebar** (white, ~260px, right border): logo; nav: Home, Jobs, Applications (warning count
  badge), Following, Career. Active item = white card with border and primary icon/text.
  The bottom area changes by page:
  - Profile strength card (label, % in primary, progress bar) on most pages.
  - On Profile: a secondary nav of **Profile, Plan & credits, Settings**. So tokens/billing
    live under "Plan & credits", and settings get their own page.
- **Top bar**: command input ("Tell Plato what to do: …", with a page-specific example prompt +
  `Ctrl K`), agent status pill (`● Plato · ready` green / `● Plato · applying 3 of 10` blue),
  token pill (10,128, only on some screens), bell, avatar.
- **Page header**: H1 + one-line description; actions on the right (primary CTA, or stat tiles).

### 06 Jobs `/jobs`
- **Second column** (~240px): `+ New search` button; "All jobs +18" item; a **Following** card
  (company monograms, "+2 roles", `7 new` primary pill); saved searches grouped under mono
  eyebrows TODAY / YESTERDAY / PREVIOUS 7 DAYS / OLDER, each showing a `+N` new count.
  So searches are like chat history now.
- Header: "All jobs", "122 strong matches across all your searches, best first. 14 hidden because
  they don't accept applicants from Egypt. **Show them**". Primary CTA `✦ Select my top 10`.
- Tabs as a segmented group: **For you** (solid ink/primary) · Saved 4 · Applied 6 · Hidden.
  Then filter chips: `✓ Can apply from Egypt` (on, primary-soft), Remote (on), Senior,
  Posted: any time, Salary.
- **Job row card**: checkbox, monogram tile, **title** + inline meta (company · location ·
  mode · age · type), a Plato reason line (P badge) with an optional **warning chip**
  ("Hybrid in Riyadh: needs relocation", amber soft), match % pill (primary-soft), `Apply`.
- **Sticky bulk bar** at the bottom: count circle "3 selected", Clear (link), `Apply` (outline),
  `Tailor & apply` (primary), pagination "1-6 of 122" with ‹ ›.

### 07 Review tailored resumes `/jobs/review-resumes`
- `← Back to jobs`; H1 "Review your tailored resumes"; "Plato made one resume per job. You only
  see what changed from your master resume."
- Header right: `Save for later` (outline), `Approve all & apply (10)` (primary); below them a
  progress bar (success green) + "3 of 10 approved".
- **Left list**: job rows (monogram, title, company), status pill: `Approved` (success-soft)
  / `To review` (warning-soft). Selected row = primary-soft background.
- **Right diff panel**: job header + `View full resume`; mono eyebrow `WHAT PLATO CHANGED · 3`;
  change blocks (Summary, Experience order, Keywords from the job post). Removed = red-soft with
  strikethrough, added = success-soft.
- Footer actions: `Approved ✓` (primary), `Edit`, `Use my original resume` (outline),
  `Next resume →` (link).

### 08 / 09 Applications `/applications`
- Header stat tiles: 14 Sent in 30 days · 4 Sent this week · 93% Went through ·
  **4 Need you** (warning-soft highlight tile).
- Section "All applications" + segmented filter: All · Needs you · Sent · In progress ·
  Didn't go through (with counts).
- **Table**: Job (monogram + title + company) | Status pill | Date | Resume used | action link.
  Status pills: `Needs you` (warning-soft), `Applying now` (info/teal-soft), `Queued` (grey),
  `Sent` (success-soft), `Didn't go through` (danger-soft). Actions: "See what was sent",
  "Job was closed", "Open".
- **Needs you** items. There are two layouts and one has to be picked:
  - 08: inline rows pinned at the top, with a warning-soft background and an amber left
    border; the action replaces the date and resume columns.
  - 09: a right-hand column "Needs you, Plato Apply paused these until you help", one card each
    with a type tag (Cover letter / Upload / Question / Human check).
  - The 4 kinds of blocker: **cover letter** (Use Plato's / Read it / Upload my own),
    **missing file** (dashed upload drop zone, "Saved to your documents for next time"),
    **question** (input + Save, "Plato remembers your answer for future applications"),
    **human check / captcha** (`Open in Chrome`, "Everything else is already filled in").

### 10 Following `/following`
- Header action `⚙ Alert settings`.
- **Companies you follow**: 4 cards (monogram, `N new` pill or "No new roles", name, industry,
  "14 for you · 212 open", `See roles` + bell icon button), "4 of 5 on Free" plan limit.
- **"4 new roles from companies you follow"** panel (primary-tint background, P badge, "Plato checks them
  every 2 hours"): rows with monogram, title, company · location · age, match %, View, Apply.
- Right column: **Roles you follow** (title, sub-meta, "N new this week", toggle switch),
  `+ Follow a role`, "Digest every 3 days · in Plato and by email". **More companies to follow**
  (search input, suggested companies with a reason line and `+ Follow`).
- Backend: `insights.prisma` already mentions followed companies, so how much exists needs checking.

### 11 Career `/career`
- Header right: "37 tests and practice sessions".
- "All tests and practice" + search; category chips: All, Interviews, Aptitude, Games,
  Personality, Skills, Language, Resume.
- 3-col **test cards**: icon tile, category tag (grey pill), title, 1-line description,
  "20 min · All levels", `Start` (outline). Pagination "Showing 1-6 of 37", ‹ 1 of 7 ›.
- Right column: **Your readiness for Presales Consultant roles** (mono eyebrow, status chips:
  success "✓ Resume 86/100", primary "Interview practice 1 of 3", grey "not started"),
  **Recommended for you** (rows with primary or outline Start), **Continue where you left off**
  (progress bar + Resume, resume score + Fix).

### 12 Profile `/profile`
- Header card: avatar, name, headline · years, location, email, LinkedIn, `+ Add portfolio`;
  right side has a ring 85% "Almost there / Add a portfolio link".
- **Underline tabs**: Resumes · Experience & skills · What I'm looking for · Application
  answers · Documents & browser. These line up with onboarding steps 1-3, and onboarding
  answers get edited here.
- Resumes tab: `Upload` (outline); Master resume row (primary-line border, `Master` tag, Preview);
  mono eyebrow `TAILORED BY PLATO · 6`; rows "Presales Consultant · Mozn / Nov 6 · 4 changes
  from master" with Preview / PDF links; "See all 6 tailored resumes".
- Right **Plato suggests** panel (primary-tint, `PLATO SUGGESTS` label, "3 changes for more
  interviews"): white sub-cards with title, explanation, and an outline action (Fix with Plato,
  Preview change, Add link).

### Added components (from 06-12)
| Component | Notes |
|---|---|
| Segmented tabs | Pill group on muted background, active = white (08-09) or solid (06 "For you") |
| Underline tabs | Profile |
| Filter chip (toggle) | Off = white with border; on = primary-soft + primary border, optional ✓ |
| Status pill | success / warning / info / neutral / danger, soft background + strong text |
| Warning inline chip | Amber soft, inside the reason line |
| Data table | Header row in tertiary text, divided rows, highlighted rows |
| Bulk action bar | Sticky bottom card |
| Diff block | Red-soft strikethrough vs success-soft addition |
| Company card | Monogram + new-count pill + stats + actions |
| Toggle switch row | Roles you follow |
| Drop zone | Dashed primary border, upload icon |
| Test card | Icon tile, tag, meta, Start |
| Pagination | ‹ n of N › square buttons |
| Ring stat | Profile completeness, weekly goal |

## 6. Full flow

```
Onboarding: documents → preferences → connect extension → Home
Home → Top matches → Apply  ─┐
Jobs (searches, filters) → select N → "Tailor & apply" → Review tailored resumes → Approve all & apply
                                                         ↓
Applications: Queued → Applying now → Sent / Needs you (Plato Apply paused) / Didn't go through
   Needs you → fix inline (cover letter, file, answer, captcha) → answer saved to Profile
Following: companies + roles → new roles → Apply
Career: readiness for target role → practice / tests → resume score fixes (→ Profile)
Profile: resumes (master + tailored), experience, preferences, application answers, documents
   (same data as onboarding; Plato suggests improvements)
Plan & credits, Settings: sidebar footer on Profile
```

The cross-page loop to keep consistent: anything Plato asks for once (a document,
an answer, a preference) gets saved to the Profile and never asked again. Every screen says
this in its microcopy.

### Navigation changes from today
| Today | New |
|---|---|
| jobs, applications, career (+skills, interviews), insights, messages, notifications, profile, tokens, extension | Home, Jobs, Applications, Following, Career; Profile / Plan & credits / Settings |
| `/tokens` | Plan & credits |
| `/extension` | Profile → Documents & browser, and onboarding step 3 |
| `/insights` | Probably split between Home stats and Following, needs confirming |
| `/messages`, `/notifications` | Bell, needs confirming |

## 7. Sync audit: where the screens disagree with each other

Rule for the final prototype: **one user, one moment in time, one dataset.** Every number,
status and label means the same thing on every screen. Fix these in the data, not the layout.

### Data that contradicts itself
| # | Issue | Screens | Fix |
|---|---|---|---|
| D1 | Profile strength is **92%** on Home, Jobs and Review, but **85%** on Applications, Following, Career and Profile (ring) | 05-12 | One value from the API everywhere. Use 85%, because the Profile page explains the gap (portfolio link) |
| D2 | Applications sidebar badge shows **1**, **4** and **2**, while the "Need you" tile says 4 | 05, 08, 09 | Badge = number of items that need you (4) on every page |
| D3 | "Jobs 18 new" badge only appears on Home | 05 vs 06+ | Show it on every page, or on none |
| D4 | Token pill (10,128) appears on Home, Jobs and Review but not on Applications, Following, Career or Profile | all | One top bar with the same items on every page |
| D5 | Home says **4** applications sent; its funnel says **12 sent / 5 viewed / 1 interview**; Applications says **14 in 30 days / 4 this week** | 05, 08 | Name the period: Home "4 sent this week" = Applications "4 this week". Funnel = last 30 days (14) |
| D6 | Home: "**Mozn** invited you to interview". Applications: Mozn is **Queued**. Review: Mozn is **Approved** but not sent yet | 05, 07, 08 | Pick a company that's already Sent for the interview (e.g. Moniepoint). Mozn stays Queued |
| D7 | Home: "Moniepoint **viewed** your application". There's no "Viewed" status in Applications | 05, 08 | Add a `Viewed` status pill (Sent → Viewed → Interview), or drop "viewed" from the funnel |
| D8 | Applications 08: tabs **All 11** but Needs you 4 + Sent 4 + In progress 6 + Didn't 1 = 15. Screen 09 shows **All 9**, with Oracle and CI&T missing from the table | 08, 09 | States can't overlap: Needs you, In progress (Queued + Applying), Sent, Didn't go through. They add up to All, and every Needs-you card also has a table row |
| D9 | Jobs "For you" shows **Apply** on jobs that are already Sent, Queued or Needs you (EXCELerate, Moniepoint, Odion, LTM, Mozn) | 06 vs 08 | Applied jobs leave "For you" (they're under Applied 6), or the button shows their status |
| D10 | SDAIA is **To review** in Review resumes but already **Didn't go through (Nov 4)** in Applications | 07, 08 | Take SDAIA out of the review batch |
| D11 | Jobs "Following **7 new**" vs Following page: 3+1+1 = **5** new across companies, and "**4** new roles from companies you follow" | 06, 10 | One count. Use the new-roles count, which is the same number everywhere |
| D12 | Applications rows say "Applied to EXCELerate **1d**" (Home) but "Nov 5" (Applications), when today is Nov 7 | 05, 08 | Use relative dates from the same timestamp |
| D13 | Agent status says "applying 3 of 10" on most pages but "ready" on Jobs/Review in the same session | 05-12 | Fine if it's a real state change. In the prototype, put Jobs/Review *before* the batch starts and everything else *after* |
| D14 | Extension popup says **v0.2**, but the repo's extension is 0.1.1 | 04 | Read it from the extension's package.json |

### UI patterns that drift
| # | Issue | Fix |
|---|---|---|
| U1 | **Four tab styles**: solid ink pill (Jobs "For you"), white segmented (Applications), primary filled chip (Career "All"), underline (Profile) | Two only: **segmented** for filtering a list (Jobs, Applications, Career) and **underline** for switching sections of one object (Profile) |
| U2 | Onboarding actions are in three different places: step 1 primary at bottom left; step 2 Back + Continue at top right; step 3 Continue then Back at bottom left with Skip on the right | One footer on every step: `Back` (outline) on the left, `Continue →` (primary) on the right, `Skip for now` link only where allowed. The step 2 top-right buttons can stay as a sticky copy |
| U3 | The step indicator sits at a different height on each onboarding step (y ≈ 139 / 137 / 148) | One shared `OnboardingHeader` |
| U4 | Labels mix three styles: mono eyebrows (`WHAT PLATO CHANGED · 3`, `TAILORED BY PLATO · 6`, `YOUR READINESS FOR`), sans uppercase primary (`PLATO READ YOUR CV`, `PLATO SUGGESTS`), and sans sentence case | Mono eyebrow = metadata/counters/dates. Sans uppercase primary = only for a label inside a **Plato note** |
| U5 | The match % appears as a ring (Home), a primary-soft pill (Jobs, Following) and plain text (Home following list) | Ring on large job cards, pill in rows. Same color and rounding |
| U6 | The Apply button is full width with a bookmark on Home, compact on Jobs, and compact with View on Following | Fine by size, but the label and order should match: `[View] [Apply]`, bookmark always as an icon button |
| U7 | Company logos are a grey monogram tile (MZ, EX), except "PwC" which is mixed case | Monogram = first letters, uppercase, max 3 letters |
| U8 | The Plato note has three forms: full panel (onboarding, Following, Profile), single line with a P badge (job cards), inline headline (preferences) | Keep all three. They're `PlatoNote` size variants (`panel`, `inline`, `headline`) |
| U9 | Count chips: "18 new" primary-soft, "1" amber circle, "7 new" solid primary, "+18" plain primary text | Nav counts: amber = needs you, primary-soft = new. In-list counts: plain primary `+N` |
| U10 | The Profile page has a bottom nav (Profile / Plan & credits / Settings) that the other pages don't | Show that bottom nav on every page above Profile strength, so Profile is always reachable |

## 8. AI native layer: keep the native chat, change the owner's design as little as possible

Today, `/jobs` *is* the chat (`chat-panel`, `jobs/[threadId]`, `stage-stepper`, `plato-dock`),
and `GlobalAssistant`, `CommandPalette` and `AgentCursor` run on every page. The owner's
screens don't show chat, but they already have the hooks for it. We plug the chat into those
spots and don't add new UI:

1. **Command bar = the chat's entry point.** "Tell Plato what to do…" (Ctrl K) opens the
   native chat as a right-side panel over the current page, already holding that page's
   context. The example prompt changes per page, as the screens show. This replaces the
   floating assistant button, so there's one way in.
2. **Jobs left column = chat threads.** `New search` starts a chat thread. TODAY/YESTERDAY/
   PREVIOUS 7 DAYS/OLDER are the existing threads (`/jobs/[threadId]`), each with its
   `+N` new matches. Opening a thread shows the chat on top and its results below in the
   owner's list design. "All jobs" is every thread combined.
3. **The agent status pill is live.** `● Plato · applying 3 of 10` comes from the extension
   progress (`extension-progress.tsx`). Clicking it opens a popover with the queue.
4. **Plato notes come from the AI**, not from fixed copy: job reasons, the salary range hint,
   "Plato read your CV", Profile suggestions. Each one can have an "Ask Plato" action
   that opens the chat about that item.
5. **Actions go back through the agent.** "Select my top 10", "Tailor & apply", "Fix with
   Plato" and "Use Plato's" all start agent tasks that show up in the status pill and the chat.
6. **Onboarding stays a form, with the AI built in.** Plato reads the CV (step 1), prefills
   preferences and estimates the job count (step 2). The current onboarding assistant panel
   becomes a small "Ask Plato" link in the step footer, so the owner's layout doesn't change.

## 9. Merge: owner's screens + chat prototype → final prototype

Inputs:
- **A. Owner's screens** (`screens/01-12`): page-based app with flat cards. **This is the base and its layout stays.**
- **B. Chat prototype** ("Plato Chat Prototype", claude.ai/artifact/5UybmszH4WWDh8QGsbwKFF,
  screenshots in `prototype/`): chat-first. "One conversation runs everything", with slash commands
  (`/job-search /build-resume /practice-interview /prove-skill /applications /profile`),
  one question at a time with suggested-answer chips, results as cards in the chat, and a side panel
  (Jobs / Applications / Resume / Profile) for the full lists.

Principle: **A is the body, B is the brain.** We keep A's pages, layout and look, and bring in B's
conversation behavior through the hooks A already has: the command bar, the status pill, Plato
notes and the Jobs searches column. We don't take B's layout (chat as the whole screen) or its
glass styling.

### What each screen takes from B
| Owner screen | Kept from A | Added from B |
|---|---|---|
| **Shell** | Sidebar, top bar, Profile strength | Command bar opens the **Plato chat panel** (right side, 440-500px, like B's side panel but reversed: page stays main). Typing `/` shows B's 6 skills. The status pill opens the live apply queue (B's progress card) |
| **Home** 05 | Greeting card, stats, Top matches, Applications, Following | B's summary line in the greeting ("Since yesterday I applied to 2 jobs and I'm applying to Talabat right now, with 1 more in line"), plus B's **Waiting for you** strip (amber row with Answer) above Top matches |
| **Jobs** 06 | Searches column, list, filters, bulk bar | `New search` opens a **chat thread in the main area**: one question at a time with chips, and Plato skips anything already said ("accounting jobs in Riyadh from home" fills 3 answers). When it's done, the thread shows A's results list. Each search in the column = one thread (`/jobs/[threadId]`, already exists) |
| **Review resumes** 07 | Whole screen | B's rule, "Nothing is sent until you confirm", becomes the copy on `Approve all & apply`. After confirming, the live queue shows in the status pill and in Applications |
| **Applications** 08/09 | Stats, table, Needs you | Needs-you answers say "I'll remember it for every application" and save to Profile → Application answers. B's chip answers (Immediately / 2 weeks / 1 month / 2 months) replace free text where options are known |
| **Following** 10 | Whole screen | "Follow companies hiring presales in Dubai" works from the command bar |
| **Career** 11 | Whole screen | B's **Learn & prove a skill** ("Kafka · 7 jobs ask for it"): skills your matches ask for that aren't on your CV. A new "Skills you're missing" block in the right column, and the Skills tab. Practice interview opens in the chat panel with scoring |
| **Profile** 12 | Header, tabs, Plato suggests | B's "Just tell me" input at the top of each tab ("my notice period is one month", "I moved to Jeddah"). B's "Not yet: I'll ask when a form needs it" as the empty state for answers |
| **Onboarding** 01-03 | All 3 steps | No change. B has no onboarding, and A's onboarding is already AI-filled |
| **Extension** 04 | Whole screen | No change |

### Rules taken from B, applied everywhere
1. **Ask once, remember forever.** Every answer the user gives (chat, Needs you, onboarding) goes to Profile and is never asked again.
2. **One question at a time, with suggested answers.** Free text is always allowed.
3. **Nothing is sent without confirmation.** Every bulk action shows what will happen first.
4. **Plato reports in the first person** in the chat ("I applied", "I'm applying"). Plato notes on the page stay in the third person, as in A ("Plato read your CV").
5. **Works for any job.** Copy and examples must work for an accountant or HR person, not only engineers (B ships a second persona, Mona, a senior accountant, for this).

### Style conflicts: A wins
| Topic | A (owner) | B (prototype) | Final |
|---|---|---|---|
| Surfaces | Flat white cards, paper background | Glass, radial gradient background | **A** |
| Page background | `#F5F8FC`-ish | `#EEF4FB` | **A** |
| Warning text | amber `#D97706` | `#B45309` | **B's `#B45309`** for text/pill text (`#D97706` on `#FEF3C7` is only ~2.6:1); keep `#D97706` for fills and dots |
| Danger | `#F04438` | `#D92D20` / soft `#FEE4E2` | **B's** for text (better contrast); update `BRAND.md` |
| Violet | none | design notes only | Drop (prototype-only) |
| Fonts | Plus Jakarta Sans + Geist Mono | same | Same |
| Company avatar | Grey monogram tile | Colored circle with initial | **A** |

## 10. Open questions
1. Does the onboarding AI assistant/FAQ panel stay, or is it gone?
2. "Following" (companies + roles): how much backend exists (`insights.prisma`)?
6. Applications "Needs you": inline rows (08) or side column (09)?
3. Where do Insights, Messages, Tokens and Extension live now that they're out of the sidebar?
4. Responsive/mobile versions of these screens?
5. Do the landing page and extension also move to the flat style (I'm assuming yes for the extension popup)?
