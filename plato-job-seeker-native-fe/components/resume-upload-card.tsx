import { FileText, Lock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ResumeDropzone } from "@/components/resume-dropzone"
import type { JobSeekerDocument } from "@/lib/documents/schema"

function ResumeUploadCard({
  document,
  onUpload,
}: {
  document: JobSeekerDocument | undefined
  onUpload: (file: File) => Promise<void>
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Upload your CV / Resume</span>
        </div>

        <ResumeDropzone document={document} onUpload={onUpload} />

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Your CV is private and only visible to you.
        </div>
      </CardContent>
    </Card>
  )
}

export { ResumeUploadCard }
