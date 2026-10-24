"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { cn } from "cn"
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const Combobox = ComboboxPrimitive.Root

// Same input surface as components/ui/input.tsx (h-11, rounded-lg, border-input,
// same focus ring) so this reads as the same field type as Input/Select — it just
// grows past h-11 once chips wrap, same as TagInput.
const ComboboxChips = React.forwardRef<HTMLDivElement, ComboboxPrimitive.Chips.Props>(
  function ComboboxChips({ className, ...props }, ref) {
    return (
      <ComboboxPrimitive.Chips
        ref={ref}
        data-slot="combobox-chips"
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-white px-3 py-1.5 text-sm transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20",
          className
        )}
        {...props}
      />
    )
  }
)

// Renders as our own Badge (same component TagInput uses), not a hand-rolled chip.
function ComboboxChip({ className, children, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      render={<Badge variant="secondary" className={cn("gap-1", className)} />}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipRemove({ className, ...props }: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={cn("ml-0.5 rounded-full hover:text-destructive", className)}
      {...props}
    >
      <XIcon className="size-3" />
    </ComboboxPrimitive.ChipRemove>
  )
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-6 w-auto min-w-24 flex-1 border-0 bg-transparent p-0 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

// Same visual slot as InputGroupAddon's leading icon (components/ui/input-group.tsx).
function ComboboxSearchIcon({ className }: { className?: string }) {
  return <SearchIcon className={cn("size-4 shrink-0 text-muted-foreground", className)} />
}

// Same popup chrome as SelectContent (components/ui/select.tsx): rounded-lg,
// bg-popover, ring-1 ring-foreground/10, same open/close animation.
function ComboboxContent<Item>({
  className,
  empty,
  children,
  anchor,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  ...props
}: Omit<ComboboxPrimitive.Popup.Props, "children"> &
  Pick<ComboboxPrimitive.Positioner.Props, "anchor" | "align" | "side" | "sideOffset"> & {
    empty?: React.ReactNode
    children: (item: Item, index: number) => React.ReactNode
  }) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = React.useState({ up: false, down: false })

  function updateScrollState(el: HTMLDivElement) {
    setScrollState({
      up: el.scrollTop > 0,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    })
  }

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollState(el)
    // Recompute when the filtered item list shrinks/grows the scroller's content.
    const observer = new ResizeObserver(() => updateScrollState(el))
    observer.observe(el)
    return () => observer.disconnect()
  })

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ top: amount, behavior: "smooth" })
  }

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          ref={scrollerRef}
          onScroll={(e) => updateScrollState(e.currentTarget)}
          data-slot="combobox-content"
          className={cn(
            "relative isolate z-50 max-h-72 w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {scrollState.up && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Scroll up"
              onClick={() => scrollBy(-96)}
              className="sticky -top-1 z-10 -mx-1 -mt-1 mb-1 flex w-[calc(100%+0.5rem)] cursor-default items-center justify-center bg-popover py-1 hover:bg-accent"
            >
              <ChevronUpIcon className="size-4 text-muted-foreground" />
            </button>
          )}
          {empty && <ComboboxEmpty>{empty}</ComboboxEmpty>}
          <ComboboxPrimitive.List>{children}</ComboboxPrimitive.List>
          {scrollState.down && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Scroll down"
              onClick={() => scrollBy(96)}
              className="sticky -bottom-1 z-10 -mx-1 -mb-1 mt-1 flex w-[calc(100%+0.5rem)] cursor-default items-center justify-center bg-popover py-1 hover:bg-accent"
            >
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </button>
          )}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

// Same row metrics as SelectItem (components/ui/select.tsx).
function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-2 pr-8 pl-2.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Item>
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-2.5 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxInput,
  ComboboxSearchIcon,
  ComboboxContent,
  ComboboxItem,
  ComboboxEmpty,
}
