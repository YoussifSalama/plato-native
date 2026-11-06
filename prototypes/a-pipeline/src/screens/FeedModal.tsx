import { useEffect, useState } from "react"
import { Bell, Coins, Sparkles, Wand2 } from "lucide-react"
import { COST, useStore } from "../store"
import { Button, Field, inputCls, Modal, Segmented, TagEditor } from "../ui"
import type { Feed, Setup } from "../types"

const CITIES = ["Remote", "Dubai", "Abu Dhabi", "Riyadh", "Berlin", "London", "Amsterdam", "Cairo", "Doha"]

// Turns a sentence into search criteria. The real product asks the model; the
// prototype reads a few obvious words so the flow can be tried end to end.
export function parseAsk(text: string) {
  const t = text.toLowerCase()
  const where = CITIES.filter((c) => t.includes(c.toLowerCase()))
  const setup: Setup[] = []
  if (/remote/.test(t)) setup.push("Remote")
  if (/hybrid/.test(t)) setup.push("Hybrid")
  if (/on.?site|office/.test(t)) setup.push("On-site")
  const sal = t.match(/\$?\s?(\d+(?:[.,]\d+)?)\s?k/)
  const level = t.match(/\b(senior|staff|lead|principal|junior)\b/)?.[1]
  const KINDS: [RegExp, string][] = [[/full.?stack/, "Full Stack"], [/back.?end/, "Backend"], [/front.?end/, "Frontend"], [/platform/, "Platform"], [/devops|sre/, "DevOps"], [/data/, "Data"], [/node/, "Node.js"], [/python/, "Python"], [/\bgo(lang)?\b/, "Go"], [/mobile|ios|android/, "Mobile"], [/\bqa\b|test/, "QA"], [/software/, "Software"]]
  const kind = KINDS.find(([re]) => re.test(t))?.[1]
  const noun = /developer/.test(t) ? "Developer" : "Engineer"
  const role = kind ? [level && level[0].toUpperCase() + level.slice(1), kind, noun].filter(Boolean).join(" ") : ""
  return { roles: role ? [role] : [], where: where.length ? where : setup.includes("Remote") ? ["Remote"] : [], setup: setup.length ? setup : (["Remote", "Hybrid"] as Setup[]), salaryMin: sal ? Math.round(parseFloat(sal[1].replace(",", ".")) * 1000) : undefined }
}

export function FeedModal() {
  const { s, ui, setUi, createFeed, updateFeed, toast } = useStore()
  const open = !!ui.newFeed
  const opts = typeof ui.newFeed === "object" ? ui.newFeed : {}
  const editing = s.feeds.find((f) => f.id === opts.edit)
  const [ask, setAsk] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [where, setWhere] = useState<string[]>([])
  const [setup, setSetup] = useState<Setup[]>([])
  const [salary, setSalary] = useState("")
  const [alert, setAlert] = useState<Feed["alert"]>("daily")
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) return
    const src = editing ?? { roles: s.profile.prefs.roles.slice(0, 1), where: [], setup: s.profile.prefs.setup, salaryMin: s.profile.prefs.salaryMin, alert: "daily" as const, name: "" }
    setRoles(src.roles)
    setWhere(src.where)
    setSetup(src.setup)
    setSalary(src.salaryMin ? String(src.salaryMin) : "")
    setAlert(src.alert)
    setName(editing?.name ?? "")
    setAsk(opts.prompt ?? "")
    if (opts.prompt) apply(opts.prompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opts.edit, opts.prompt])

  function apply(text: string) {
    const p = parseAsk(text)
    if (p.roles.length) setRoles(p.roles)
    if (p.where.length) setWhere(p.where)
    setSetup(p.setup)
    if (p.salaryMin) setSalary(String(p.salaryMin))
  }
  const autoName = name || `${roles[0] ?? "Jobs"}${where.length ? ` · ${where.slice(0, 2).join(", ")}` : ""}`
  const close = () => setUi({ newFeed: false })
  const submit = () => {
    const f = { name: autoName, roles, where, setup, salaryMin: salary ? Number(salary) : undefined, alert }
    if (editing) {
      updateFeed(editing.id, f)
      close()
      toast("Search updated. Plato uses it from the next run")
    } else createFeed(f)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={editing ? "Edit search" : "New search"}
      sub={editing ? "Changes apply the next time it runs." : "Describe it in a sentence or fill the fields. Plato keeps running it and tells you about new matches."}
      footer={
        <>
          {!editing && (
            <span className="mr-auto flex items-center gap-1.5 text-[13px] text-ink-2">
              <Coins className="size-4 text-warning" /> {COST.search} tokens per run
            </span>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={submit} disabled={!roles.length}>
            {editing ? "Save search" : "Start searching"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!editing && (
          <form
            className="flex flex-col gap-2 rounded-2xl bg-tint p-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              apply(ask)
            }}
          >
            <label htmlFor="feed-ask" className="text-[13px] font-bold">
              Tell Plato what you want
            </label>
            <div className="flex gap-2">
              <input id="feed-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. Senior backend roles in Dubai or remote, from $6k a month" className={inputCls} />
              <Button type="submit" variant="soft" icon={<Wand2 className="size-4" />} disabled={!ask.trim()}>
                Fill
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Remote Node.js roles from $5k", "Senior backend in Riyadh, hybrid", "Platform engineer in London"].map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => {
                    setAsk(x)
                    apply(x)
                  }}
                  className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-blue hover:bg-soft"
                >
                  {x}
                </button>
              ))}
            </div>
          </form>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Roles" id="feed-roles">
            <TagEditor id="feed-roles" values={roles} onChange={setRoles} placeholder="Type a title, press Enter" suggestions={s.profile.prefs.roles} />
          </Field>
          <Field label="Where" id="feed-where">
            <TagEditor id="feed-where" values={where} onChange={setWhere} placeholder="City, country or Remote" suggestions={["Remote", "Dubai", "Riyadh", "Berlin"]} />
          </Field>
          <Field label="Work setup">
            <div className="flex flex-wrap gap-2">
              {(["Remote", "Hybrid", "On-site"] as Setup[]).map((x) => (
                <button key={x} type="button" aria-pressed={setup.includes(x)} onClick={() => setSetup(setup.includes(x) ? setup.filter((y) => y !== x) : [...setup, x])} className={`h-9 rounded-full border px-4 text-[13px] font-semibold ${setup.includes(x) ? "border-cobalt bg-soft text-cobalt" : "border-line bg-white text-ink-2"}`}>
                  {x}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Minimum salary (USD / month)" id="feed-salary" hint="Jobs that don't list pay still show, marked as unknown.">
            <input id="feed-salary" inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value.replace(/\D/g, ""))} placeholder="4500" className={inputCls} />
          </Field>
          <Field label="Name" id="feed-name" hint={!name ? `Will be called “${autoName}”` : undefined}>
            <input id="feed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} className={inputCls} />
          </Field>
          <Field label="Alert me about new matches">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-ink-3" />
              <Segmented
                size="sm"
                value={alert}
                onChange={setAlert}
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "off", label: "Off" },
                ]}
              />
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  )
}
