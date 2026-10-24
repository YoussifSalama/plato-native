"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxInput,
  ComboboxSearchIcon,
  ComboboxContent,
  ComboboxItem,
} from "@/components/ui/combobox"

type Option = { value: string; label: string }

function OptionCombobox({
  options,
  value,
  onChange,
  placeholder,
  max,
  creatable = false,
  id,
}: {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  max?: number
  creatable?: boolean
  id?: string
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState("")
  const [open, setOpen] = useState(false)
  const selectedItems = value.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v })
  const unselectedOptions = options.filter((o) => !value.includes(o.value))
  const atMax = max != null && value.length >= max

  function addValue(next: Option) {
    if (atMax || value.includes(next.value)) return
    onChange([...value, next.value])
    setInputValue("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (creatable && event.key === "Enter" && inputValue.trim()) {
      const trimmed = inputValue.trim()
      const match = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase())
      event.preventDefault()
      addValue(match ?? { value: trimmed, label: trimmed })
    }
  }

  return (
    <Combobox
      items={unselectedOptions}
      multiple
      value={selectedItems}
      onValueChange={(items) => onChange(items.map((i) => i.value))}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open && !atMax}
      onOpenChange={setOpen}
    >
      <ComboboxChips ref={anchorRef}>
        <ComboboxSearchIcon />
        {selectedItems.map((item) => (
          <ComboboxChip key={item.value}>
            {item.label}
            <ComboboxChipRemove />
          </ComboboxChip>
        ))}
        <ComboboxInput
          id={id}
          placeholder={atMax ? `Max ${max} selected` : placeholder}
          disabled={atMax}
          onKeyDown={handleKeyDown}
        />
      </ComboboxChips>
      <ComboboxContent<Option>
        anchor={anchorRef}
        empty={creatable && inputValue.trim() ? `Press Enter to add "${inputValue.trim()}"` : "No matches"}
      >
        {(item) => (
          <ComboboxItem key={item.value} value={item}>
            {item.label}
          </ComboboxItem>
        )}
      </ComboboxContent>
    </Combobox>
  )
}

export { OptionCombobox }
