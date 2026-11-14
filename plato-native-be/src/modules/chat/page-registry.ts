// What each page of the app is, and its controls by the stable name written in the
// frontend code (`data-ai="..."`). The assistant reads this to know a page BEFORE
// it is open; the live page only adds what changes (list rows, values).
// page-registry.spec.ts fails if a name here is missing from the frontend code.
//   id   exact name, or with <angle> parts for items that exist once per row
//   tpl  set when the frontend builds the name from a template: the start of it

export interface Control {
  id: string;
  label: string;
  does: string;
  tpl?: string;
}
export interface PageEntry {
  path: string;
  purpose: string;
  controls: Control[];
}

const nav = (name: string, path: string): Control => ({
  id: `nav.${name}`,
  label: name[0].toUpperCase() + name.slice(1),
  does: `Sidebar: go to ${path}`,
  tpl: 'nav.',
});

export const PAGES: Record<string, PageEntry> = {
  everywhere: {
    path: 'every page',
    purpose:
      'The sidebar is on every page. Ctrl+K (Cmd+K on Mac) opens quick search: every page and Career tab, start a search, practise an interview, build a resume, tour this page, and find any of your searches or applications by name.',
    controls: [
      {
        id: 'verify-email.resend',
        label: 'Send the link again (email banner)',
        does: 'Sends a new email confirmation link',
      },
      {
        id: 'dock.commands',
        label: 'Commands (Plato AI panel)',
        does: "Shows the panel's quick commands",
      },
      {
        id: 'dock.command.<key>',
        label: 'A quick command in the Plato AI panel',
        does: 'Runs that command',
        tpl: 'dock.command.',
      },
      {
        id: 'chat.reference',
        label: 'The pinned job chip in the composer',
        does: 'Removes or shows the job the next message is about',
      },
      {
        id: 'chat.input',
        label: 'Message box (Plato AI panel, and a search before it runs)',
        does: 'Where the seeker types to Plato; Enter sends',
      },
      { id: 'chat.send', label: 'Send', does: 'Sends the message' },
      {
        id: 'chat.attach',
        label: 'Attach a CV (Plato AI panel)',
        does: 'Picks a PDF or Word file to send with the next message',
      },
      nav('home', '/'),
      nav('jobs', '/jobs'),
      nav('applications', '/applications'),
      nav('following', '/following'),
      nav('career', '/career'),
      nav('extension', '/extension'),
      nav('messages', '/messages'),
      nav('notifications', '/notifications'),
      nav('profile', '/profile'),
      { id: 'nav.logo', label: 'Plato logo', does: 'Goes to / (Home)' },
      {
        id: 'crumb.<page>',
        label: 'Breadcrumb above the title (e.g. JOBS, CAREER)',
        does: 'Goes back up to that parent page; on a search it is crumb.jobs',
        tpl: 'crumb.',
      },
      {
        id: 'assistant.new-conversation',
        label: 'New conversation (Plato AI panel)',
        does: 'Starts a fresh Plato AI conversation in the side panel (the panel is on every page)',
      },
      {
        id: 'assistant.recent',
        label: 'Recent conversations (Plato AI panel)',
        does: 'Shows earlier conversations (searches and career chats) to switch to',
      },
      {
        id: 'assistant.voice',
        label: 'Voice interview (Plato AI panel)',
        does: 'Opens the interview flow (/career/interviews/new) with "out loud" (voice) already chosen',
      },
      {
        id: 'tour.start',
        label: 'Tour this page (compass, bottom right)',
        does: 'Starts a guided tour of the page the seeker is on',
      },
    ],
  },
  home: {
    path: '/',
    purpose:
      "Home: the seeker's week at a glance. Greeting with one line on where things stand; new matches, applications sent, interviews (the ones the seeker marked on their applications) and this week's goal; Your next steps (the setup path, until done or dismissed); the top 3 matches as cards with Apply and save; their applications (sent / viewed / interview) and latest moves; new roles from companies they follow. A new account with no matches sees Start a search instead of the cards. Questions about how the hunt is going are answered here.",
    controls: [
      {
        id: 'home.job:<jobId>',
        label: "A top match's title",
        does: "Opens that job's posting",
        tpl: 'home.job:',
      },
      {
        id: 'home.matches',
        label: 'New matches (number)',
        does: 'Goes to /jobs',
      },
      {
        id: 'home.applied',
        label: 'Applications sent (number)',
        does: 'Goes to /applications',
      },
      {
        id: 'home.interviews',
        label: 'Interviews (number)',
        does: 'Opens sent applications; counts the ones the seeker marked as an interview or offer',
      },
      {
        id: 'home.next-step',
        label: 'Your next steps button',
        does: 'Does the next setup step: complete details, link the extension, first search, apply, or set an alert',
      },
      {
        id: 'home.first-search',
        label: 'Start a search',
        does: 'Starts a new search conversation, shown when there are no matches yet',
      },
      { id: 'home.all-jobs', label: 'See all N', does: 'Goes to /jobs' },
      {
        id: 'home.apply:<jobId>',
        label: 'Apply on a top match',
        does: 'Opens the apply-with-the-extension dialog for that job',
        tpl: 'home.apply:',
      },
    ],
  },
  jobs: {
    path: '/jobs',
    purpose:
      'Jobs: the seeker\'s searches on the left (each a Plato conversation, grouped by day, with New search and a Following link), every match on the right, best first. Picking a search shows only its jobs (/jobs?search=<searchId>) with a Refine with Plato link to its conversation. Tabs For you / Saved / Applied / Hidden, filters (Can apply from <country>, Remote, Senior, Posted, Shows salary), List or Cards, a checkbox on each job, Select my top 10, and a bottom bar to Apply or Tailor & apply the ticked jobs. With no searches yet the list is empty with a New search button. This is where "my last search" is found.',
    controls: [
      {
        id: 'jobs.view.<view>',
        label: 'List | Cards',
        does: 'Shows jobs one per row (list) or as cards (cards)',
        tpl: 'jobs.view.',
      },
      {
        id: 'jobs.new-search',
        label: 'New search',
        does: 'Starts a new search conversation',
      },
      {
        id: 'jobs.following',
        label: 'Following',
        does: 'Goes to /following',
      },
      {
        id: 'jobs.search:<searchId>',
        label: 'A search in the left column (its name)',
        does: "Shows only that search's jobs in the list (/jobs?search=<searchId>); its conversation is at /jobs/<searchId>",
        tpl: 'jobs.search:',
      },
      {
        id: 'jobs.top-ten',
        label: 'Select my top 10',
        does: 'Ticks the 10 best jobs that are not applied to yet',
      },
      {
        id: 'jobs.job:<jobId>',
        label: 'A job title',
        does: 'Opens the original posting in a new tab',
        tpl: 'jobs.job:',
      },
      {
        id: 'jobs.apply:<jobId>',
        label: 'Apply on a job',
        does: 'Opens the apply-with-the-extension dialog for that job',
        tpl: 'jobs.apply:',
      },
      {
        id: 'jobs.tab.<tab>',
        label: 'For you | Saved | Applied | Hidden',
        does: 'Switches the list (tab = discover, saved, applied, hidden)',
        tpl: 'jobs.tab.',
      },
      {
        id: 'jobs.apply-selected',
        label: 'Apply (bottom bar)',
        does: 'Opens the apply dialog for every ticked job, with their own CV',
      },
      {
        id: 'jobs.tailor-selected',
        label: 'Tailor & apply (bottom bar)',
        does: 'Opens /jobs/review for the ticked jobs: Plato writes one resume per job to review before applying',
      },
    ],
  },
  review: {
    path: '/jobs/review',
    purpose:
      "Review your tailored resumes (/jobs/review?ids=...): Plato writes one resume per ticked job, one at a time; the left list shows each job's state (queued, writing, ready to review, check skills, failed, approved). The open job shows either progress while it is written, a skills check (tick the skills the job asks for that are really yours, then Write the resume or Use my original resume), an error with Try again, or what changed from the profile (summary, experience order, keywords) with a match score, Approve, Edit and Use my original resume. Nothing is sent until Approve all & apply. Opened without jobs it only says to pick jobs on Jobs first.",
    controls: [
      {
        id: 'review.approve',
        label: 'Approve',
        does: 'Approves the resume shown for this job and moves to the next one',
      },
      {
        id: 'review.approve-all',
        label: 'Approve all & apply (N)',
        does: 'Approves every written resume and opens the apply dialog with them',
      },
    ],
  },
  results: {
    path: '/jobs/<searchId>',
    purpose:
      "One search (/jobs/<searchId>), three screens. 1) Before it runs: a full-screen chat with Plato (what it knows from the profile, three one-click starts, a message box); Plato asks short questions, sometimes as a card with options, and only searches when the seeker agrees. 2) While it runs: live progress, a map of every step and Plato's notes. 3) When done: a summary (strong and excellent matches, Apply to top 15 jobs), tabs Discover / Saved / Applied / Recommended, a search box, filters with sort and Export, the job list with checkbox, bookmark and interview practice per row, and Your selection beside it. A failed search shows the reason above the results.",
    controls: [
      {
        id: 'results.tab.<tab>',
        label: 'Discover | Saved | Applied | Recommended',
        does: 'Switches the list (tab = discover, saved, applied, recommended)',
        tpl: 'results.tab.',
      },
      {
        id: 'results.filters',
        label: 'Filter bar',
        does: 'Row of filters (location, type, level, posted, salary) and sorting',
      },
      {
        id: 'results.apply-top',
        label: 'Apply to top 15 jobs',
        does: 'Opens a confirmation to apply to the best matches',
      },
      {
        id: 'results.apply-selected',
        label: 'Let me select jobs | Apply to N selected',
        does: 'Opens a confirmation for the ticked jobs',
      },
      {
        id: 'results.job:<n>',
        label: 'Job title of row n (1 = top)',
        does: 'Opens the original posting in a new tab',
        tpl: 'results.job:',
      },
      {
        id: 'results.save:<n>',
        label: 'Bookmark on row n',
        does: 'Saves or unsaves that job',
        tpl: 'results.save:',
      },
      {
        id: 'results.mock-interview:<n>',
        label: 'Bot icon on row n',
        does: 'Opens the interview flow for that job (/career/interviews/new with the job chosen); it asks the round, chat or voice and the style, then shows the cost and Start',
        tpl: 'results.mock-interview:',
      },
    ],
  },
  applications: {
    path: '/applications',
    purpose:
      "Every application: tiles (sent in 30 days, sent this week, went through, need you), tabs All / In progress / Sent / Didn't go through, a table (job, status, date, resume used, an action per row: See what was sent, Retry, Watch live) with 20 per page, and on the right 'Needs you': what Plato paused on, each card with one button (applications.need:<id>) that opens the answer form in place. With no applications yet it shows 'No applications yet' and a Find jobs link. A warning card on top says when Plato still needs your details before it can apply. Paths: ?tab=active|applied|problems|needs, ?thread=<searchId>.",
    controls: [
      {
        id: 'applications.tab.<tab>',
        label: 'Status tabs',
        does: 'Filters the list by status',
        tpl: 'applications.tab.',
      },
      {
        id: 'applications.row:<applicationId>',
        label: 'An application',
        does: 'Opens that application (/applications/<id>)',
        tpl: 'applications.row:',
      },
      {
        id: 'applications.retry:<applicationId>',
        label: 'Retry',
        does: 'Puts a failed application back in the queue',
        tpl: 'applications.retry:',
      },
      {
        id: 'applications.need:<applicationId>',
        tpl: 'applications.need:',
        label:
          'Answer | Check skills | Add details | Open (on a Needs you card)',
        does: 'Opens the answer form for that paused application, in place on the Needs you card',
      },
    ],
  },
  application: {
    path: '/applications/<applicationId>',
    purpose:
      "One application. The top card says where it stands and the one next step: Answer what Plato needs (paused: the answer form is just below), Check the employer's site (not sure it was sent), Retry (didn't go through), Heard back? Mark it (sent). Then the steps Plato or the extension took, what was sent (confirmation, a screenshot as proof, the resume used with Open/Download PDF, the answers filled in), the job, 'Did you hear back?' (sent only) and the small print. Remove takes it off the list.",
    controls: [
      { id: 'application.back', label: 'Back', does: 'Back to /applications' },
      {
        id: 'application.retry',
        label: 'Retry',
        does: 'Retries a failed application',
      },
      {
        id: 'application.withdraw',
        label: 'Remove',
        does: "Starts removing the application from Plato's list (asks to confirm first)",
      },
      {
        id: 'application.outcome.interview',
        tpl: 'application.outcome.',
        label: 'Did you hear back? Interview',
        does: 'Marks a sent application as an interview (the seeker says so; Plato cannot read replies). Siblings: .none, .viewed, .offer, .rejected',
      },
    ],
  },
  career: {
    path: '/career',
    purpose:
      'Career overview. Two looks: a new seeker (no score yet) sees stage "Get started", empty Continue and "No results yet", and recommendations led by a first practice interview; once anything is scored it shows readiness, the four dimensions (resume, interviewing, skills proven, proof of work), up to three recommended next steps, continue where you left off and recent results. The Career tabs under the header open every part of Career (Assessments, Interviews, Proof of skills, Skills gap, Snapshot, Practice library). With ?prompt/?thread/?chat it opens that request or conversation in the coach side panel and the address goes back to /career.',
    controls: [
      {
        id: 'career.retry',
        label: 'Try again (when Career data failed to load)',
        does: 'Reloads the Career data',
      },
      {
        id: 'career.interview.open',
        label: 'Open the interview (card in Plato AI)',
        does: 'Opens the interview the coach just set up',
      },
      {
        id: 'career.snapshot',
        label: 'Profile snapshot',
        does: 'Opens /career/snapshot (skills, readiness, strengths, weaknesses, history)',
      },
      {
        id: 'career.rec:<n>',
        label: 'Recommended next',
        does: 'Starts recommendation n (0 = the top one): an assessment or proof challenge, or for an interview it opens the interview flow (/career/interviews/new) preset for it',
        tpl: 'career.rec:',
      },
      {
        id: 'career.nav.<path>',
        label:
          'Career tabs: Overview | Assessments | Interviews | Proof of skills | Skills gap | Snapshot | Practice library',
        does: 'Opens that part of Career (path = /career, /career/quizzes, /career/interviews, /career/proof, /career/skills, /career/snapshot, /career/library). On every Career page',
        tpl: 'career.nav.',
      },
      {
        id: 'career.coach',
        label: 'Ask your coach',
        does: 'Opens the career coach in the side panel (a new conversation)',
      },
      {
        id: 'career.results.all',
        label: 'All results',
        does: 'Opens the history on /career/snapshot',
      },
      {
        id: 'career.result:<id>',
        label: 'A recent result',
        does: 'Opens that result report',
        tpl: 'career.result:',
      },
    ],
  },
  interviews: {
    path: '/career/interviews',
    purpose:
      'Interviews: ONE way in ("Practise an interview" opens the interview flow at /career/interviews/new), Continue for unfinished written interviews, progress (count, finished, average, best, trend once two are finished) and one history of every interview, newest first, each marked Chat or Voice and Real or Coach (written ones open /career/interviews/<id>, voice results open /career/results/<id>). With no interviews yet the history shows "No interviews yet" and the stats are 0.',
    controls: [
      {
        id: 'interviews.new',
        label: 'Practise an interview',
        does: 'Opens the interview flow (/career/interviews/new)',
      },
      {
        id: 'interviews.continue:<interviewId>',
        label: 'Continue (an unfinished interview)',
        does: 'Opens that written interview at the question it stopped',
        tpl: 'interviews.continue:',
      },
      {
        id: 'interviews.row:<interviewId>',
        label: 'An interview',
        does: 'Opens it (questions, answers, scorecard)',
        tpl: 'interviews.row:',
      },
      {
        id: 'career.result:<id>',
        label: 'An interview (voice call result)',
        does: 'Opens that voice interview result (/career/results/<id>); voice results are kept in this browser',
        tpl: 'career.result:',
      },
    ],
  },
  interviewFlow: {
    path: '/career/interviews/new',
    purpose:
      'The interview flow, like onboarding: one question per screen, each answer moves on. 1 What are you preparing for (job | general | situation); 2-3 job: which job (search, Matches/Saved/Applied, Show more, or paste a job post) then which round; general: role (+ optional main skill) then kind of questions; situation: which one (salary negotiation, case interview, presenting a solution, business English) then role; 4 how (voice = out loud, chat = in writing); 5 style (real = feedback at the end, coach = after every answer); 6 Ready: a summary with the exact cost and ONE Start; 7 the interview itself (chat opens /career/interviews/<id>; a voice call runs on this page). Screens on this path: the question screens (step 1-5; the job step can switch to "Paste the job post": title, company, the post, at least 30 words, kept in this tab only), Ready (summary with Change per answer, length, cost, Start; Get more tokens when the balance is short), the live voice call (time used, whose turn, the transcript, Mute, End call), and "No scorecard this time" (Try again, Back to Interviews) when a call ends without a scorecard. A call with a scorecard opens its result at /career/results/<id>. Answers are in the URL and a preset skips its question: ?target=job|general|situation&job=<jobId>&jt=<job title>&jc=<company>&role=<role>&notes=<notes>&focus=mixed|behavioral|technical|situational&format=negotiation|case|pitch|english&round=screen|manager|loop&how=chat|voice&style=real|coach. Start spends the seeker\'s tokens: never press interview.new.start, never start a call; the seeker presses it.',
    controls: [
      {
        id: 'interview.new.exit',
        label: 'Exit (interview setup)',
        does: 'Leaves the setup and goes back to Interviews',
      },
      {
        id: 'interview.new.paste.title',
        label: 'Pasted job: title',
        does: 'The job title of a pasted post',
      },
      {
        id: 'interview.new.paste.company',
        label: 'Pasted job: company',
        does: 'The company of a pasted post (optional)',
      },
      {
        id: 'interview.new.role:<role>',
        label: 'A suggested role chip',
        does: 'Fills the role with that suggestion',
        tpl: 'interview.new.role:',
      },
      {
        id: 'interview.new.tokens',
        label: 'Tokens (on the Ready step)',
        does: 'Opens Plan & credits',
      },
      {
        id: 'interview.call.again',
        label: 'Try again (voice call ended with no scorecard)',
        does: 'Goes back to set up the call again',
      },
      {
        id: 'interview.new.target.<target>',
        label:
          "A job I'm applying to | Interview practice in general | A specific situation",
        does: 'Answers question 1 (job, general, situation) and moves on',
        tpl: 'interview.new.target.',
      },
      {
        id: 'interview.new.search',
        label: 'Search your jobs',
        does: 'Filters the job list by title or company',
      },
      {
        id: 'interview.new.jobs.<tab>',
        label: 'Matches | Saved | Applied',
        does: "Which of the seeker's jobs the list shows (discover, saved, applied)",
        tpl: 'interview.new.jobs.',
      },
      {
        id: 'interview.new.job:<jobId>',
        label: 'A job in the list',
        does: 'Picks that job and moves on',
        tpl: 'interview.new.job:',
      },
      {
        id: 'interview.new.more',
        label: 'Show more',
        does: 'Loads more jobs into the list',
      },
      {
        id: 'interview.new.paste',
        label: 'Paste a job post instead',
        does: 'Opens the paste form (title, company, description)',
      },
      {
        id: 'interview.new.paste.text',
        label: 'Job description',
        does: 'Paste the posting (30+ words)',
      },
      {
        id: 'interview.new.role',
        label: 'Role',
        does: 'Type the role (general practice and situations)',
      },
      {
        id: 'interview.new.notes',
        label: 'Anything we should know? (optional)',
        does: 'Type notes for the interviewer: level, company type, topics, or a job ad (general practice and situations, up to 2000 characters)',
      },
      {
        id: 'interview.new.skill',
        label: 'Main skill (optional)',
        does: 'Type the skill for technical questions',
      },
      {
        id: 'interview.new.focus.<focus>',
        label: 'Mixed | Behavioral | Technical | Situational',
        does: 'Kind of questions (general practice); moves on',
        tpl: 'interview.new.focus.',
      },
      {
        id: 'interview.new.format.<format>',
        label:
          'Salary negotiation | Case interview | Presenting a solution | Business English',
        does: 'Which situation (negotiation, case, pitch, english); moves on',
        tpl: 'interview.new.format.',
      },
      {
        id: 'interview.new.round.<round>',
        label: 'First call | Hiring manager | All rounds',
        does: 'Which hiring round (screen, manager, loop); moves on',
        tpl: 'interview.new.round.',
      },
      {
        id: 'interview.new.how.<how>',
        label: 'Out loud | In writing',
        does: 'voice = a live call on this page; chat = written answers; moves on',
        tpl: 'interview.new.how.',
      },
      {
        id: 'interview.new.style.<style>',
        label: 'Like the real interview | Coach me',
        does: 'real = feedback at the end; coach = feedback after every answer; moves on',
        tpl: 'interview.new.style.',
      },
      {
        id: 'interview.new.next',
        label: 'Next',
        does: 'Moves to the next question',
      },
      {
        id: 'interview.new.back',
        label: 'Back',
        does: 'The previous question',
      },
      {
        id: 'interview.new.edit:<step>',
        label: 'Change (on the summary)',
        does: 'Goes back to that question (job, format, target, round, focus, role, how, style)',
        tpl: 'interview.new.edit:',
      },
      {
        id: 'interview.new.start',
        label: 'Start the interview / Start the call',
        does: 'Starts it and spends tokens. ONLY the seeker presses it',
      },
      {
        id: 'interview.call.end',
        label: 'End call',
        does: 'Ends the voice call; the scorecard follows',
      },
      {
        id: 'interview.call.mute',
        label: 'Mute',
        does: 'Mutes or unmutes the microphone during the call',
      },
      {
        id: 'interview.back',
        label: 'Back to Interviews',
        does: 'Opens /career/interviews (on the "No scorecard this time" screen after a voice call)',
      },
    ],
  },
  interview: {
    path: '/career/interviews/<interviewId>',
    purpose:
      "One written interview, the flow's last step: the conversation so far, the question to answer now (coach style shows feedback under each answer), Finish later; when finished, the result: score, what it means, what went well, what to work on, every answer with its feedback, the next step and Practise again. Real style: no feedback until the scorecard. Coach style: a 1-5 score, a note and a stronger answer under each answer.",
    controls: [
      {
        id: 'interview.result.item:<n>',
        label: 'An answer in the result',
        does: 'Expands that answer and its feedback',
        tpl: 'interview.result.item:',
      },
      {
        id: 'interview.snapshot',
        label: 'Your snapshot (result)',
        does: 'Opens /career/snapshot',
      },
      { id: 'interview.answer', label: 'Answer box', does: 'Type the answer' },
      {
        id: 'interview.send',
        label: 'Send answer',
        does: 'Submits the answer',
      },
      {
        id: 'interview.later',
        label: 'Finish later',
        does: 'Back to Interviews; the answers so far are kept',
      },
      {
        id: 'interview.again',
        label: 'Practise again',
        does: 'Opens the interview flow on its summary with the same choices (after finishing)',
      },
      {
        id: 'interview.back',
        label: 'Back to Interviews',
        does: 'Opens /career/interviews',
      },
      {
        id: 'interview.new.exit',
        label: 'Interviews (top left)',
        does: 'Opens /career/interviews; answers so far are saved',
      },
    ],
  },
  skills: {
    path: '/career/skills',
    purpose:
      "Skills gap: skills the best-matching jobs ask for that the profile does not show, with how many jobs each would unlock. A row opens ways to learn it (courses) and links to the assessment or a challenge. The seeker marks a course I'm taking it, then I finished it and adds the certificate link, which Plato verifies before adding the skill. With no gaps it says so and offers Find jobs. Below: the seeker's courses and certificates.",
    controls: [
      {
        id: 'skills.row:<slug>',
        label: 'A skill row',
        does: "Opens or closes that skill's ways to learn it",
        tpl: 'skills.row:',
      },
      {
        id: 'skills.assess:<slug>',
        label: 'Take the assessment',
        does: 'In an open row: opens the assessment for that skill',
        tpl: 'skills.assess:',
      },
      {
        id: 'skills.prove:<slug>',
        label: 'Prove it with a challenge',
        does: 'In an open row: opens a challenge for that skill',
        tpl: 'skills.prove:',
      },
      {
        id: 'skills.taking:<courseId>',
        label: "I'm taking it",
        does: 'Marks that course as in progress',
        tpl: 'skills.taking:',
      },
      {
        id: 'skills.finished:<courseId>',
        label: 'I finished it',
        does: 'Opens the dialog to add the certificate link or file. Only the seeker types the link',
        tpl: 'skills.finished:',
      },
      {
        id: 'skills.find-jobs',
        label: 'Find jobs',
        does: 'Shown when there are no gaps: opens /jobs',
      },
      {
        id: 'skills.cert.finish:<credentialId>',
        label: 'Mark finished',
        does: 'On a course in progress: opens the dialog to add the certificate',
        tpl: 'skills.cert.finish:',
      },
      {
        id: 'skills.cert.remove:<credentialId>',
        label: 'Remove',
        does: 'Asks to confirm, then removes that course or certificate. Only when the seeker asks',
        tpl: 'skills.cert.remove:',
      },
    ],
  },
  snapshot: {
    path: '/career/snapshot',
    purpose:
      'Profile snapshot: readiness, every skill with its level and evidence, strengths, weaknesses, all recommendations and the history of scored activities.',
    controls: [
      {
        id: 'snapshot.assess:<skill>',
        label: 'Assess',
        does: 'Starts the assessment for that skill',
        tpl: 'snapshot.assess:',
      },
      {
        id: 'snapshot.prove:<skill>',
        label: 'Prove it',
        does: 'Opens a proof-of-skill challenge for that skill',
        tpl: 'snapshot.prove:',
      },
      {
        id: 'snapshot.profile',
        label: 'Open profile',
        does: 'Shown when there are no skills: opens /profile to add them',
      },
      {
        id: 'snapshot.library',
        label: 'Browse practice',
        does: 'Shown when there is no history yet: opens /career/library',
      },
    ],
  },
  library: {
    path: '/career/library',
    purpose:
      'Practice library: every aptitude test, skill practice and resume exercise in Career, filtered by category and search. Items with their own screen open it; the rest start the career coach chat with the request. Interviews are not here: they start from /career/interviews/new.',
    controls: [
      {
        id: 'library.cat.<category>',
        label: 'All | Aptitude | Skills | Resume',
        does: 'Filters the list by category',
        tpl: 'library.cat.',
      },
      {
        id: 'library.search',
        label: 'Search practice',
        does: 'Filters by name',
      },
      {
        id: 'library.start:<id>',
        label: 'A practice card',
        does: 'Starts it. ids: numerical, logical, assessment, proof, skill-gap, resume-score, build-resume, tailor',
        tpl: 'library.start:',
      },
      {
        id: 'library.interviews',
        label: 'Looking for interview practice?',
        does: 'Opens the interview flow (/career/interviews/new)',
      },
      {
        id: 'library.clear',
        label: 'Clear search',
        does: 'Shown when nothing matches: clears the search and the category',
      },
    ],
  },
  quizzes: {
    path: '/career/quizzes',
    purpose:
      'Quiz Builder: practise the real hiring test for any job. Build a quiz from one of the seeker\'s jobs or a pasted description (Plato researches how the company tests candidates and writes the quiz in its format), take quizzes from the shared library, and see your quizzes with best scores. A quiz opens at /career/quizzes/<id>; results at /career/quizzes/<id>/results/<attemptId>.',
    controls: [],
  },
  proof: {
    path: '/career/proof',
    purpose:
      'Proof-of-skill challenges: real work samples scored against a visible rubric. Challenges for CV skills first, then for skill gaps, then the rest. Each card shows Draft saved, Passed or a score to retry.',
    controls: [
      {
        id: 'proof.open:<id>',
        label: 'Start',
        does: 'Opens the challenge workspace',
        tpl: 'proof.open:',
      },
    ],
  },
  proofWorkspace: {
    path: '/career/proof/<id>',
    purpose:
      'One challenge: the brief and the rubric (Check my work ticks covered points), an editor that saves a draft as the seeker types, a word target, then Submit for scoring, which opens the result at /career/results/<id>.',
    controls: [
      { id: 'proof.editor', label: 'Editor', does: 'The seeker writes here' },
      {
        id: 'proof.check',
        label: 'Check my work',
        does: 'Ticks the rubric items the draft already covers',
      },
      {
        id: 'proof.submit',
        label: 'Submit for scoring',
        does: 'Scores it and opens the result',
      },
      {
        id: 'proof.exit',
        label: 'Save and exit',
        does: 'Back to /career/proof; the draft is kept',
      },
    ],
  },
  result: {
    path: '/career/results/<id>',
    purpose:
      'One result report. Assessments and challenges: score and what it means, breakdown, what went well and what to work on, every question explained (assessment) or the rubric and the submission (challenge), Do next and how the profile snapshot moved. Voice and older written interviews open the interview result instead (score, answer by answer, next step, Practise again: interview.again, interview.snapshot, interview.result.item:<n>). A result saved in another browser shows "This result isn\'t on this device" with Back to Career.',
    controls: [
      { id: 'result.retry', label: 'Try again', does: 'Starts it again' },
      {
        id: 'result.back',
        label: 'Back to Assessments | Proof of skills | Career',
        does: 'Opens the Career tab the result belongs to (Career when the result is not on this device)',
      },
      {
        id: 'result.item:<n>',
        label: 'A question or rubric point',
        does: "Expands it to show the seeker's answer (n from 0)",
        tpl: 'result.item:',
      },
      {
        id: 'result.snapshot',
        label: 'View profile snapshot',
        does: 'Opens /career/snapshot',
      },
    ],
  },
  notifications: {
    path: '/notifications',
    purpose:
      'Finished searches, application updates and new jobs from job alerts, live. Filter tabs All / Unread / Applications / Searches / Job alerts; Mark all read.',
    controls: [
      {
        id: 'notifications.filter.<key>',
        label: 'All | Unread | Applications | Searches | Job alerts',
        does: 'Filters the list (key = all, unread, application, run, alert)',
        tpl: 'notifications.filter.',
      },
      {
        id: 'notifications.mark-all-read',
        label: 'Mark all read',
        does: 'Marks everything read',
      },
      {
        id: 'notifications.item:<id>',
        label: 'A notification',
        does: 'Opens what it is about',
        tpl: 'notifications.item:',
      },
    ],
  },
  profile: {
    path: '/profile',
    purpose:
      "The seeker's profile, in tabs (?tab=...): resumes (default: the master resume with its score, and the versions Plato tailored), experience (from the CV, plus three forms resumes use, filled with type_text then submitted. Project: p-name, p-desc, p-tech, p-result, p-url. Result (achievement): a-text, a-metric, a-company. Skill with proof: s-skill, s-proof, s-url, plus a level button), looking (what they want), answers (application answers), documents (files and the browser extension).",
    controls: [
      {
        id: 'profile.tab.<tab>',
        label:
          "Profile tabs: Resumes | Experience & skills | What I'm looking for | Application answers | Documents & browser",
        does: 'Switches the profile tab (resumes, experience, looking, answers, documents)',
        tpl: 'profile.tab.',
      },
      {
        id: 'profile.add-project',
        label: 'Add project',
        does: 'Saves the project form',
      },
      {
        id: 'profile.add-result',
        label: 'Add result',
        does: 'Saves the result form',
      },
      {
        id: 'profile.add-skill',
        label: 'Add skill',
        does: 'Saves the skill-with-proof form',
      },
    ],
  },
  following: {
    path: '/following',
    purpose:
      'Companies and roles the seeker follows: a status line (what is watched, how often, how alerts arrive), new roles from the latest digest with View and Apply (or one line when there are none), the companies list (See roles opens /jobs?company=<name>, a bell to pause, ✕ to unfollow, Follow a company), roles they follow with on/off switches and Follow a role, Alert settings (how often, email), and "Follow more companies" with a search box. With nothing followed yet both lists show an empty state; Alert settings (following.settings) opens a panel above the lists.',
    controls: [
      {
        id: 'following.follow-role',
        label: 'Follow a role',
        does: 'Opens the box to follow a new role (job title)',
      },
      {
        id: 'following.company-search',
        label: 'Search any company',
        does: 'Type a company name to find and follow it',
      },
      {
        id: 'insights.cadence.<cadence>',
        label: 'How often (Alert settings)',
        does: 'Sets how often digests arrive',
        tpl: 'insights.cadence.',
      },
      {
        id: 'insights.digest:<id>',
        label: 'A past digest',
        does: 'Opens that digest',
        tpl: 'insights.digest:',
      },
      {
        id: 'insights.job:<id>',
        label: 'A job in a digest',
        does: 'Opens that job',
        tpl: 'insights.job:',
      },
      {
        id: 'following.see-roles',
        label: 'See roles (on a company card)',
        does: "Opens /jobs?company=<name>: that company's roles",
      },
      {
        id: 'following.settings',
        label: 'Alert settings',
        does: 'Opens or closes the alert settings panel (how often, in Plato, by email)',
      },
    ],
  },
  extension: {
    path: '/extension',
    purpose:
      "The Plato Apply Chrome extension: Generate code (or Link another browser) shows a one-time code for two minutes with Copy, and the page moves on by itself once the extension uses it; 'Your searches' with a tick box to feature a search first in the extension; and the linked browsers with Unlink and Unlink all.",
    controls: [
      {
        id: 'extension.code',
        label: 'The one-time code',
        does: "The code to type into the extension's side panel (expires in two minutes)",
      },
      {
        id: 'extension.generate',
        label: 'Generate code',
        does: 'Makes a one-time code to paste into the extension',
      },
      {
        id: 'extension.copy',
        label: 'Copy',
        does: 'Copies the pairing code (only shown while a code is on screen)',
      },
    ],
  },
  tokens: {
    path: '/tokens',
    purpose:
      "Plan & credits: the seeker's Plato token balance, where tokens went this month, the plans, one-time top-up packs, the token history (All / Spent / Added) and a short FAQ. Applying is always free.",
    controls: [
      {
        id: 'tokens.balance',
        label: 'Balance',
        does: 'The tokens left this month and what that is enough for',
      },
      {
        id: 'tokens.see-plans',
        label: 'Upgrade plan',
        does: 'Scrolls to the plans (nothing is bought)',
      },
      {
        id: 'tokens.see-topups',
        label: 'Top up',
        does: 'Scrolls to the one-time token packs (nothing is bought)',
      },
      {
        id: 'tokens.plan.<plan>',
        label: 'A plan card',
        does: "Shows that plan; changing plan is the seeker's choice, never press it for them",
        tpl: 'tokens.plan.',
      },
      {
        id: 'tokens.topup.<pack>',
        label: 'A top-up pack',
        does: "A one-time pack; buying is the seeker's choice, never press it for them",
        tpl: 'tokens.topup.',
      },
      {
        id: 'tokens.history.<filter>',
        label: 'History: All | Spent | Added',
        does: 'Filters the token history',
        tpl: 'tokens.history.',
      },
    ],
  },
  messages: {
    path: '/messages',
    purpose:
      'Not built yet (coming soon page): says employer messages will land here; meanwhile links to Notifications and Applications.',
    controls: [],
  },
};

export const PAGE_KEYS = Object.keys(PAGES) as [string, ...string[]];

// One line per page for the prompt; the full entry comes from describe_page.
export const pageIndex = () =>
  Object.entries(PAGES)
    .map(([k, p]) => `- ${k} (${p.path}): ${p.purpose}`)
    .join('\n');

// The page a named control lives on, when that page has a fixed address.
export function pathOfControl(id: string): string | null {
  for (const p of Object.values(PAGES)) {
    if (p.path.includes('<') || p.path === 'every page') continue;
    if (p.controls.some((c) => c.id === id || (c.tpl && id.startsWith(c.tpl))))
      return p.path;
  }
  return null;
}
