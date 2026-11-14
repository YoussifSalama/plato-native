import { redirect } from "next/navigation"

// Skill assessments became Quizzes: built for any job, in the company's own test format.
export default function AssessmentsPage() {
  redirect("/career/quizzes")
}
