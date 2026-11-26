import { redirect } from "next/navigation"

// Every test and practice now lives on the Career overview; old links land there.
export default function LibraryPage() {
  redirect("/career")
}
