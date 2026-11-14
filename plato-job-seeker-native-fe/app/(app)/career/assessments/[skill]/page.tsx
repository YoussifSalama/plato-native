import { redirect } from "next/navigation"

// Old per-skill assessment links land on Quizzes.
export default function AssessmentPage() {
  redirect("/career/quizzes")
}
