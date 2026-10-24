import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"

function CareerEvidenceCard({ children }: { children: ReactNode }) {
  return (
    <Card className="h-fit">
      <CardContent className="flex flex-col gap-4">
        <span className="text-sm font-semibold text-foreground">Add more career evidence</span>
        {children}
      </CardContent>
    </Card>
  )
}

export { CareerEvidenceCard }
