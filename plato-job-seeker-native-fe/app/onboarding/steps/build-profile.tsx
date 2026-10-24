"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Award, BrainCircuit, FileStack, GraduationCap, History, Lock, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResumeUploadCard } from "@/components/resume-upload-card"
import { CareerEvidenceCard } from "@/components/career-evidence-card"
import { DocumentUploadTile } from "@/components/document-upload-tile"
import { SecureBadge } from "@/components/secure-badge"
import { AnalyzingModal } from "@/components/analyzing-modal"
import { BuildProfileSkeleton } from "@/components/onboarding-skeletons"
import { analyzeProfile, deleteDocument, listDocuments, uploadDocument } from "@/lib/documents/api"
import type { JobSeekerDocument } from "@/lib/documents/schema"
import { distributeColors, ICON_COLORS } from "@/lib/icon-colors"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

const TRUST_CARD_DEFS = [
  {
    icon: BrainCircuit,
    title: "Smarter with more evidence",
    description: "The more documents you add, the more complete a profile Plato can build for you.",
  },
  {
    icon: History,
    title: "Nothing gets overwritten",
    description: "Every batch of documents you upload is kept as its own version — earlier uploads are never lost.",
  },
  {
    icon: Lock,
    title: "Your documents, your control",
    description: "Remove any document at any time. Nothing stays unless you keep it.",
  },
]

const TRUST_CARDS = TRUST_CARD_DEFS.map((card, i) => ({ ...card, color: distributeColors(TRUST_CARD_DEFS.length)[i] }))

const OPTIONAL_TILE_DEFS = [
  { type: "CERTIFICATE" as const, title: "Certificates", description: "Upload certificates and credentials", icon: Award },
  { type: "LICENSE" as const, title: "Licenses", description: "Professional licenses and registrations", icon: ShieldCheck },
  { type: "DEGREE" as const, title: "Degrees / transcripts", description: "Upload degrees and academic records", icon: GraduationCap },
  { type: "OTHER" as const, title: "Other documents", description: "Anything else that supports your profile", icon: FileStack },
]

const OPTIONAL_TILE_COLORS = distributeColors(OPTIONAL_TILE_DEFS.length)
const OPTIONAL_TILES = OPTIONAL_TILE_DEFS.map((tile, i) => ({ ...tile, color: OPTIONAL_TILE_COLORS[i] }))

function BuildProfileStep({ onContinue }: { onContinue: () => void }) {
  const [documents, setDocuments] = useState<JobSeekerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false))
  }, [])

  const cv = documents.find((d) => d.type === "CV_RESUME")
  const canContinue = cv?.status === "READY"

  async function handleUpload(file: File, type: JobSeekerDocument["type"]) {
    const doc = await uploadDocument(file, type)
    setDocuments((prev) => [...prev.filter((d) => d.id !== doc.id), doc])
  }

  async function handleDelete(id: string) {
    await deleteDocument(id)
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  async function handleContinue() {
    setError(null)
    setAnalyzing(true)
    try {
      await analyzeProfile()
      onContinue()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) return <BuildProfileSkeleton />

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6"
    >
      <motion.div variants={fadeUpItem} className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            Build your career profile
            <motion.span
              animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" as const }}
            >
              <Sparkles className="size-5 text-primary" />
            </motion.span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Give Plato a clear picture of your experience so I can find and apply to better opportunities for you.
          </p>
        </div>
        <SecureBadge />
      </motion.div>

      <motion.div variants={fadeUpItem} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div whileHover={{ y: -2 }} className="rounded-xl shadow-sm transition-shadow hover:shadow-lg">
          <ResumeUploadCard document={cv} onUpload={(file) => handleUpload(file, "CV_RESUME")} />
        </motion.div>

        <CareerEvidenceCard>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {OPTIONAL_TILES.map((tile) => (
              <motion.div
                key={tile.type}
                variants={fadeUpItem}
                whileHover={{ y: -2 }}
                className="rounded-xl shadow-sm transition-shadow hover:shadow-lg"
              >
                <DocumentUploadTile
                  icon={tile.icon}
                  title={tile.title}
                  description={tile.description}
                  documents={documents.filter((d) => d.type === tile.type)}
                  onUpload={(file) => handleUpload(file, tile.type)}
                  onDelete={handleDelete}
                  color={tile.color}
                />
              </motion.div>
            ))}
          </motion.div>
        </CareerEvidenceCard>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {TRUST_CARDS.map((card) => (
          <motion.div
            key={card.title}
            variants={fadeUpItem}
            whileHover={{ y: -4 }}
            className="flex items-start gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-xl"
          >
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${ICON_COLORS[card.color]}`}>
              <card.icon className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{card.title}</span>
              <span className="text-xs text-muted-foreground">{card.description}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.div
        variants={fadeUpItem}
        className="w-fit"
        whileHover={canContinue && !analyzing ? { scale: 1.03 } : undefined}
        whileTap={canContinue && !analyzing ? { scale: 0.97 } : undefined}
      >
        <Button
          onClick={handleContinue}
          disabled={!canContinue || analyzing}
          className="w-fit gap-2 shadow-md shadow-primary/30 transition-shadow hover:shadow-lg hover:shadow-primary/40"
        >
          Continue
        </Button>
      </motion.div>

      <AnalyzingModal open={analyzing} />
    </motion.div>
  )
}

export { BuildProfileStep }
