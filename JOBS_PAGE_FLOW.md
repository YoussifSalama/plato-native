# Jobs Page Flow - Complete Specification

## Overview

Jobs page is the main interface after onboarding completes. It's an AI-native agent orchestrator with handoff agents for job discovery. User redirects here right after onboarding; returning users with existing profiles redirect to Home page instead.

---

## Entry Point

**Redirect Logic:**
- After onboarding completes successfully → `/jobs`
- User logs in with existing profile → `/home` (not yet built)
- User accesses `/jobs` directly → redirect to `/login` if not authenticated

---

## Initial State: Chat Mode (Full Width)

### Page Layout
- **Chat area**: Full width, full height
- **No stages visible** initially
- **Snapshot already loaded**: AI has user profile context

### AI Behavior - First Message (Auto-Generated)

AI receives snapshot from onboarding containing:
- User name
- Analyzed job titles/roles from experience
- Skills, languages, certifications
- Document versions (CV, certificates)
- Profile evaluation (completeness status)

**AI constructs greeting message:**
```
Example: "Hello Ahmed, How can I help you today? 
Are you looking for full stack development positions?"
```

Where:
- "Ahmed" = from snapshot (user name)
- "full stack development" = inferred from snapshot analysis (what their experience shows)

### User Interaction - Chat Phase

User responds naturally:
```
User: "No, I'm looking for backend engineer positions"
AI: "Got it! Backend engineer roles. Do you have any location preferences?"
User: "Remote or EU based"
AI: "Perfect. Do you have any salary expectations?"
```

**Chat continues until AI understands user wants to search.** Trigger phrases:
- "Start searching"
- "Find jobs for me"
- "Show me positions"
- "Let's begin"
- (AI interprets intent from context too)

---

## Transition: Chat → Sidebar + Main Area Opens

### What Triggers Transition

When AI detects user is ready to search (from conversation):

```
AI Message: "Great! Let me search for backend engineer roles that match your profile. 
I'll gather all the details and find the best matches for you."
```

### Layout Change

**Before:**
```
┌─────────────────────────────┐
│                             │
│     Chat (Full Width)       │
│                             │
└─────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│          Main Area (Job Results)   │ Sidebar    │
│          (Stages 1, 2, 3, etc)     │ Chat      │
│                                    │           │
│                                    │ Minimized │
│                                    │ Chat      │
│                                    │           │
└─────────────────────────────────────────────────┘
```

- **Left/Center**: Main area with job discovery stages
- **Right**: Chat sidebar (user can minimize/expand, continues throughout)
- **Notification center**: Available in sidebar or header

---

## Stage 1: Check Requirements

### Purpose
Verify and finalize what the user is looking for before searching. AI determines exact parameters.

### What's Displayed

Three sections (auto-loaded from snapshot + conversation):

#### 1. **Who You Are**
```
Name: Ahmed
Current Role: Full Stack Developer
Key Skills: JavaScript, React, Node.js, MongoDB
Years of Experience: 5
Location: Currently in Egypt
```
Source: Snapshot from onboarding

#### 2. **What You're Looking For**
```
Job Title(s): Backend Engineer
Locations: Remote, EU-based
Job Type: Full-time
Seniority: Mid to Senior
Work Setup: Remote, Hybrid
Salary Range: $80k - $120k USD
Availability: Immediate
```
Source: Conversation + snapshot preferences

#### 3. **Your Profile Status**
```
CV/Resume: ✅ Uploaded (v2)
Certificates: ✅ 2 files
Languages: ✅ English (Fluent), Arabic (Native)
Experience: ✅ 5 positions documented
Education: ✅ Bachelor's in CS
Location: ⚠️ Could use more detail (add neighborhood/timezone)
```
Source: Snapshot + document versions

### User Actions Available (Check Requirements Stage)

User can choose to:

#### Option A: Proceed As-Is
```
Button: "Looks good, search for jobs"
→ Move to Stage 2
```

#### Option B: Update Profile Directly
```
Links: "Edit CV", "Add Certificate", "Update Experience", "Add Languages"
→ Opens collapsible forms to edit (like onboarding Step 2)
```

#### Option C: Ask AI Assistant to Update
```
User (in sidebar chat): "Can you update my CV with my recent project?"
AI: [Analysis] "Sure, I can help. Upload the new CV or tell me details."
→ AI analyzes file/text, versions it, updates in background
```

#### Option D: Upload New Files
```
Upload zone: Drag-drop or click to upload
- CV/Resume
- Cover Letter
- Certificate
- Supporting Document
→ AI analyzes → versions in DB
```

### AI's Role (Check Requirements Stage)

1. **Extraction**: Takes conversation context + snapshot
2. **Job Title Inference**: 
   - User says: "Backend engineer"
   - AI reads snapshot: Full stack with 3 years backend focus
   - AI generates AVE & Strengths list:
     ```
     Primary Matches:
     - Backend Engineer
     - Full Stack Developer (you have both)
     - Software Engineer (senior level ok)
     - DevOps Engineer (if infrastructure work in profile)
     
     Secondary Matches:
     - Frontend Engineer (if needed fallback)
     ```
3. **Parameter Compilation**: Creates structured JSON
   ```json
   {
     "jobTitles": ["Backend Engineer", "Full Stack Developer"],
     "locations": ["Remote", "EU-based"],
     "jobTypes": ["full-time"],
     "salaryMin": 80000,
     "salaryMax": 120000,
     "salaryCurrency": "USD",
     "seniority": ["mid", "senior"],
     "workSetup": ["remote", "hybrid"],
     "skills": ["JavaScript", "Node.js", "MongoDB"],
     "availability": "immediate"
   }
   ```

### User Confirmation

Button: **"I have provided everything. Start searching."**
→ Move to Stage 2

---

## Stage 2: Search for Jobs (Gathering Info / Analyzing)

### Purpose
Handoff to search agent. Collect results from all job sources (LinkedIn, Workable, Lever).

### UI During Stage 2

**Animated loading state:**
```
┌──────────────────────────┐
│  Gathering Information   │
│                          │
│  🔄 Analyzing your      │
│     requirements...      │
│                          │
│  🔍 Searching LinkedIn  │
│  🔍 Searching Workable  │
│  🔍 Searching Lever     │
│                          │
│  Please wait...         │
└──────────────────────────┘
```

Animated icons rotate. Status updates in real-time (if available).

### Backend Execution (Handoff Agent)

**Handoff agent receives:**
- Search params JSON from AI
- User ID + chat session ID
- Snapshot for context

**Handoff agent does:**
1. Call LinkedIn Adapter with params
2. Call Workable Adapter with params
3. Call Lever Adapter with params
4. All 3 calls async (parallel, not sequential)
5. Store results in DB as-is (no transformation, avoid latency)
6. Notify frontend when each source returns

**Example calls:**
```
POST /job-seeker/discover
{
  "jobTitles": ["Backend Engineer", "Full Stack Developer"],
  "locations": ["Remote", "EU-based"],
  "salaryMin": 80000,
  "salaryMax": 120000,
  "workSetup": ["remote", "hybrid"]
}

→ Orchestrates:
  - apify.linkedin.adapter.search(params)
  - workable.adapter.search(params)
  - lever.adapter.search(params)

→ Stores to DB:
  DB.Job (from LinkedIn)
  DB.Job (from Workable)
  DB.Job (from Lever)
  
→ Creates:
  DB.JobSeekerJobMatch {
    jobSeekerId,
    jobId,
    matchScore (from BM25 + AI ranking),
    discoveredAt,
    source: "LINKEDIN" | "WORKABLE" | "LEVER"
  }
```

### Notification System

As results come in, notifications appear:

**Notification 1** (LinkedIn complete):
```
✅ Found 42 backend engineer roles on LinkedIn
Tap to view results
```

**Notification 2** (Workable complete):
```
✅ Found 18 backend engineer roles on Workable
Tap to view results
```

**Notification 3** (Lever complete):
```
✅ Found 25 backend engineer roles on Lever
Tap to view results
```

**Chat message** (All complete):
```
AI: "Done! I found 85 matching positions across all sources.
You can now browse the results below."
```

### Notification Behavior

- **Clickable**: Yes → redirects to `/jobs/[chatSessionId]` with job listings
- **Persistent**: Shows in notification center (history)
- **Scoped**: Only visible to authenticated user
- **Unique ID**: Each chat session has unique MongoDB ID or generated UUID
- **Isolated**: Results linked to specific chat session + user

---

## Stage 3: Results Display (Job Listings)

### Layout After Results Load

```
┌─────────────────────────────────────┬──────────────┐
│                                     │              │
│  Jobs Found: 85                     │ Chat Sidebar │
│                                     │              │
│  ┌──────────────────────────────┐   │ "Found 85    │
│  │ Backend Engineer             │   │ positions.   │
│  │ Company A | Remote | $90k    │   │ Browsing    │
│  │ ✅ Easy Apply               │   │ options?"    │
│  └──────────────────────────────┘   │              │
│                                     │              │
│  ┌──────────────────────────────┐   │ User can     │
│  │ Full Stack Developer         │   │ ask follow-  │
│  │ Company B | Hybrid | $100k   │   │ ups in chat  │
│  │ ✅ Easy Apply               │   │ or navigate  │
│  └──────────────────────────────┘   │ results      │
│                                     │              │
│  [Load More]                        │              │
│                                     │              │
└─────────────────────────────────────┴──────────────┘
```

### Job Card Display

Each job shows:
- **Title**: Job title
- **Company**: Company name
- **Location**: Location or "Remote"
- **Salary**: If available
- **Badge**: Source (LinkedIn logo, Workable badge, Lever logo)
- **Apply Button**: "Easy Apply" or "View Job"

### Filtering/Sorting (Post-Stage 2)

User can:
- Sort by: Salary, Date Posted, Match Score
- Filter by: Source, Location, Job Type, Salary Range
- Search: Text search within results

### User Next Actions

From results, user can:
1. **Click job** → Job detail modal
2. **Apply** → Application tracking (future)
3. **Ask AI in sidebar** → "Tell me more about this company", "Does this match my skills?", etc.
4. **Start new search** → Reset and go back to chat mode
5. **Refine search** → Modify parameters and re-search

---

## Chat Sidebar Behavior (Throughout All Stages)

### Sidebar State

At any point, sidebar chat is available for:
- **Questions**: "Tell me about Company X", "Does this match my background?"
- **Profile updates**: "Update my experience with...", "Add new certificate"
- **File uploads**: "Analyze this CV for me"
- **Help**: "What does 'easy apply' mean?", "How do I apply for jobs?"

### Chat Messages in Sidebar

All chat messages are queued and persisted:
- Each message tied to chat session ID
- History available when user returns
- Linked to job search context (which stage, which search params)

### Chat Session Persistence

**Chat Session ID**:
- Generated on first message at jobs page
- Stored in DB: `ChatSession { id, userId, createdAt, searchParams, notifications[] }`
- Persists across page refreshes
- Can be referenced by notification clicks

---

## Data Flow Summary

```
USER LOGIN/ONBOARDING COMPLETE
        ↓
   SNAPSHOT LOADED
        ↓
   JOBS PAGE RENDERED
        ↓
   AI GREETS (using snapshot)
        ↓
   USER CHATS WITH ORCHESTRATOR
        ↓
   AI DETECTS "READY TO SEARCH"
        ↓
   CHAT TRANSITIONS TO SIDEBAR
   MAIN AREA OPENS
        ↓
   STAGE 1: CHECK REQUIREMENTS
   (User confirms or updates profile)
        ↓
   STAGE 2: SEARCH FOR JOBS
   - Handoff Agent calls 3 adapters async
   - Results stored in DB
   - Notifications sent
        ↓
   STAGE 3: RESULTS DISPLAY
   - User browses jobs
   - Can filter, sort, ask AI
   - Can refine search
        ↓
   CHAT SESSION PERSISTED
   (History + results linked by ID)
```

---

## Technical Requirements

### Frontend
- [x] Chat component (Orchestrator)
- [ ] Chat → Sidebar transition logic
- [ ] Stage 1 UI (requirements display + edit forms)
- [ ] Stage 2 UI (loading + animated icons)
- [ ] Stage 3 UI (job listings + cards)
- [ ] Notification center
- [ ] Chat session persistence

### Backend
- [x] Snapshot generation (from onboarding)
- [x] Job adapters (LinkedIn, Workable, Lever)
- [ ] Search params validation
- [ ] Async adapter calling (handoff agent)
- [ ] Job storage + deduplication
- [ ] Match scoring (BM25)
- [ ] Notification API
- [ ] Chat session CRUD
- [ ] Authentication/Authorization on all endpoints

### Database
- [x] Job model
- [x] JobSeekerJobMatch model
- [ ] ChatSession model
- [ ] Notification model
- [ ] Chat message model (queued messages)

---

## Edge Cases & Future Considerations

- **No results**: "No jobs found. Try broader criteria?"
- **Duplicate jobs**: Deduplicate across sources
- **Real-time updates**: If job posted during search, should it appear?
- **User edits during search**: Queue next search after current completes?
- **File analysis latency**: Use embedding to pre-process uploads async
- **Salary missing**: Handle gracefully in sorting
- **International locations**: Geocode + normalize
- **Timezone considerations**: Store user timezone from profile

---

## MVP Scope (This Sprint)

**Must have:**
1. ✅ Chat orchestrator + greeting with snapshot
2. ✅ Chat → Sidebar transition
3. ✅ Stage 1: Check Requirements display
4. ✅ Stage 1: Allow profile updates
5. ✅ Stage 2: Handoff agent calling adapters
6. ✅ Stage 2: Async result collection + notifications
7. ✅ Stage 3: Job listing display
8. ✅ Chat session persistence + routing

**Nice to have:**
- Filtering/sorting
- Job detail modal
- Real-time status updates

