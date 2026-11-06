// Why C looks like this: shown per page when design notes are on.
export const NOTES: Record<string, { title: string; points: string[] }> = {
  plato: {
    title: "Plato is the front door, the pages are the record",
    points: [
      "Home is a conversation with Plato (from B): it greets you, / opens every mode, and job search is a plain-language chat instead of a form.",
      "Beside it, Today (from A) shows what needs you, what Plato is doing right now, and your board, all live. You can answer a question straight from there.",
      "Jobs, Career and Me (from A) are still one click away when you'd rather look and click than talk.",
    ],
  },
  jobs: {
    title: "The board from A, with Plato beside it",
    points: [
      "Every job is a card from New to Applied, and you can drag, select several and apply, all on the page. Questions an application is waiting on can be answered right on the card.",
      "Plato stays docked on the right with the same conversation. Anything you do on the board shows up in the chat, and anything Plato does moves the cards live.",
      "New search and Change search open the conversation instead of a form, because that's where Plato collects the details in plain words.",
    ],
  },
  career: {
    title: "The page shows what you have; Plato does the work",
    points: [
      "Resumes, interview scores and skills are listed like in A. Starting any of them hands you to Plato beside the page, already knowing which job or skill you meant.",
      "One history: a resume written in chat appears here, and a skill proven in chat shows as Proven here and on your profile.",
    ],
  },
  me: {
    title: "Edit it yourself, or just tell Plato",
    points: [
      "One profile page (from A) with a readiness meter. Every field can be typed here, or said to Plato (“my notice period is one month”); both update the same place.",
    ],
  },
}
