# Plato System Overview

AI-powered job matching platform. Job seekers upload CV → AI extracts profile → search preferences → discover ranked jobs. Two teams: backend (NestJS/MongoDB/OpenAI) + frontend (Next.js/React).

## Quick Stats

| Component | Tech | Status | Completeness |
|-----------|------|--------|--------------|
| **Backend** | NestJS 11, MongoDB (Prisma), OpenAI Agents | 10 modules built | 85-90% |
| **Frontend** | Next.js 16, React 19, shadcn/ui | 4-step onboarding | 95% |

---

## Backend: plato-native-be

**Entry**: `src/main.ts` → NestJS app on port 3000

### Architecture

```
src/modules/
├── auth/           - JWT, signup/login/logout, bcryptjs
├── user/           - JobSeeker CRUD, profiles, social links
├── documents/      - CV/cert upload, versioning
├── profile-extraction/ - OpenAI Agent → parses CV text → structured profile
├── profile-eval/   - Cross-section audit (completeness check)
├── preferences/    - Job search criteria (AI-suggested + user editable)
├── chat/           - Stage-aware onboarding assistant
├── discovery/      - Job scraping + BM25 ranking
│   ├── adapters/   - LinkedIn (Apify), ATS aggregator
│   └── agent/      - AI re-ranking (framework only, logic incomplete)
├── upload/         - Multipart → Cloudflare R2 + local fs
└── prisma/         - MongoDB ORM
```

### Key Routes

```
POST   /auth/signup                    - Register
POST   /auth/login                     - Login
GET    /auth/me                        - Current user
POST   /job-seeker/documents           - Upload doc
GET    /job-seeker/documents           - List docs
DELETE /job-seeker/documents/:id       - Remove doc
POST   /job-seeker/profile/analyze     - Trigger AI extraction
GET    /job-seeker/profile             - Get profile
PATCH  /job-seeker/profile/:section    - Update profile part
GET    /job-seeker/preferences         - Get or AI-suggest prefs
PATCH  /job-seeker/preferences         - Save prefs
POST   /job-seeker/discover            - Find jobs
GET    /job-seeker/discovered-jobs     - Ranked results (paginated)
POST   /chat                           - Chat with assistant
```

### Database Models

- **User**: account (email, password_hash, profile)
- **JobSeeker**: profile wrapper (experiences, educations, certifications, languages, skills, location)
- **JobSeekerDocument**: uploaded file (CV, cert, etc) + extracted text
- **JobSeekerDocumentVersion**: upload batch tracker
- **JobSeekerProfileEvaluation**: completeness audit (experience/education/skills/certs/languages/location → LOOKS_GOOD or NEEDS_ATTENTION)
- **JobSeekerPreference**: search criteria (roles, industries, locations, job types, salary, seniority, etc)
- **Job**: posting (source: LinkedIn/Workable/Lever, description, salary, location, remote type)
- **JobSeekerJobMatch**: seeker + job link (BM25 score + shortlist flag)

### Current Implementation

**Done**:
- Auth (signup/login, JWT + cookies, password hashing)
- Document upload & versioning (Cloudflare R2)
- Text extraction (PDF, DOCX)
- AI profile extraction (OpenAI Agents → CV text → structured data + completeness audit)
- Job discovery (LinkedIn via Apify + ATS aggregator)
- BM25 ranking (keyword matching)
- Preference management (AI-suggested + editable)
- Chat assistant (stage-aware)

**Incomplete**:
- AI re-ranking agent (framework exists, logic not built)
- Some ATS adapter integrations

**Not built**:
- Employer/recruiter matching
- Job application tracking
- Real-time notifications
- Advanced search UI

---

## Frontend: plato-job-seeker-native-fe

**Entry**: `app/layout.tsx` → Next.js App Router

### Architecture

```
app/
├── page.tsx                   - Home (placeholder)
├── login/page.tsx             - AuthForm (login mode)
├── signup/page.tsx            - AuthForm (signup mode)
└── onboarding/
    ├── page.tsx               - Step router (?step=1|2|3|4)
    └── steps/
        ├── build-profile.tsx  - Step 1: Upload CV + docs
        ├── confirm-information.tsx - Step 2: Review & edit profile
        ├── preferences.tsx    - Step 3: Set job criteria
        └── ready.tsx          - Step 4: Summary & completion

lib/
├── api-client.ts              - Axios wrapper
├── auth/                       - signup, login, logout, me
├── documents/                  - upload, list, delete
├── preferences/                - get, save prefs
├── chat/                       - send message
├── preference-options.ts       - UI dropdowns (industries, roles, locations, etc)
└── profile-validation.ts       - Completeness checks
```

### Key Pages & Components

| Page/Component | Purpose | Status |
|---|---|---|
| `/login`, `/signup` | Auth forms (email, password, name) | ✅ Done |
| `/onboarding?step=1` | Upload CV + supporting docs (drag-drop, file picker) | ✅ Done |
| `/onboarding?step=2` | Review extracted profile; edit experiences, educations, certifications, languages, location, skills | ✅ Done |
| `/onboarding?step=3` | Set job preferences (roles, industries, locations, job types, work setup, salary, seniority, availability) | ✅ Done |
| `/onboarding?step=4` | Summary & "Ready to discover" CTA | ✅ Done |
| AI Assistant Panel | Right sidebar chatbot (integrates /chat API) | ✅ Done |

### Tech Stack

- **React 19** + **Next.js 16** (App Router)
- **TailwindCSS 4** + **shadcn/ui 4.21** (Button, Input, Dialog, Form, etc)
- **React Hook Form 7** + **Zod 4.5** (form validation)
- **Axios 1.20** (HTTP client, cookie-based auth)
- **Motion 13.2** (animations)
- **Lucide React** (icons)

### Current Implementation

**Done**:
- Login & signup pages with validation
- 4-step onboarding flow (all steps built)
- Document upload (drag-drop, file picker, type selection)
- Profile review & editing (inline forms for all sections)
- Job preferences form (all criteria)
- Chat assistant UI
- API wrappers (auth, documents, preferences, chat)
- Form validation (Zod)
- Responsive design

**Incomplete / Not built**:
- Job discovery results page
- User dashboard/settings
- Job application flow
- Notification preferences UI

---

## API Contract (Backend ↔ Frontend)

### Auth Flow

```
POST /auth/signup
{ "email": "...", "password": "...", "fullName": "..." }
→ { "id": "...", "email": "..." }

POST /auth/login
{ "email": "...", "password": "..." }
→ { "id": "...", "email": "..." } (sets httpOnly cookie)

GET /auth/me
→ { "id": "...", "email": "...", "jobSeekerId": "..." }

POST /auth/logout
→ (clears cookie)
```

### Document Upload & Profile Extraction

```
POST /job-seeker/documents (multipart form-data)
{ file: File, documentType: "CV_RESUME" | "CERTIFICATE" | ... }
→ { "id": "...", "status": "UPLOADED" → "PROCESSING" → "TEXT_EXTRACTED" → "READY" }

POST /job-seeker/profile/analyze
(backend auto-extracts from latest document)
→ { "experiences": [...], "educations": [...], "certifications": [...], ... }

GET /job-seeker/profile
→ Full profile + evaluation { "experience": "LOOKS_GOOD", ... }

PATCH /job-seeker/profile/experiences
{ "data": [...] }
→ Updated profile
```

### Preferences

```
GET /job-seeker/preferences
→ { "roles": [...], "industries": [...], "locations": [...], "salary_min": ..., ... }
   OR AI-suggested if new user

PATCH /job-seeker/preferences
{ "roles": [...], ... }
→ Saved preferences
```

### Job Discovery

```
POST /job-seeker/discover
→ Triggers scraping + ranking

GET /job-seeker/discovered-jobs?skip=0&take=20
→ { "jobs": [...], "total": ... }
```

---

## What's Connected

- **Auth**: Frontend calls /auth/* → backend sets httpOnly cookie ✅
- **Documents**: Frontend uploads → backend stores in R2, extracts text ✅
- **Profile Extraction**: Frontend triggers → backend OpenAI Agent parses CV → evaluates completeness ✅
- **Preferences**: Frontend form → backend saves + suggests if new ✅
- **Chat**: Frontend sends message + stage → backend OpenAI gpt-4.1-nano returns response ✅
- **Job Discovery**: Frontend calls discover → backend scrapes + ranks, returns results ✅

---

## Deployment & Config

### Backend

**Environment** (`.env`):
```
PORT=3000
DATABASE_URL=mongodb://...
OPENAI_API_KEY=...
APIFY_TOKEN=...
CLOUDFLARE_ACCESS_KEY_ID=...
CLOUDFLARE_SECRET_ACCESS_KEY=...
CLOUDFLARE_BUCKET_NAME=...
JWT_SECRET=...
```

**Run**:
```bash
cd plato-native-be
npm install
npm run start:dev    # NestJS dev server with hot reload
# or: npm run build && npm run start
```

### Frontend

**Environment** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Run**:
```bash
cd plato-job-seeker-native-fe
npm install
npm run dev          # Next.js dev server on :3000 (different process)
```

---

## Testing

### Backend
- Jest + Supertest configured
- Run: `npm run test`

### Frontend
- ESLint configured
- Run: `npm run lint`

---

## What's Next (Post-Onboarding)

- **Job Discovery UI**: Results page, job detail modal, shortlist
- **Advanced Search**: Filters, saved searches
- **Application Tracking**: Apply button, application status
- **User Dashboard**: Profile, matches, applications, settings
- **Notifications**: Email/push for matches, messages
- **Employer Matching**: (separate backend flow, not yet started)

---

## File Locations Reference

```
Backend:  /media/youssif-salama/work1/mine/plato-native/plato-native-be/
Frontend: /media/youssif-salama/work1/mine/plato-native/plato-job-seeker-native-fe/
```

