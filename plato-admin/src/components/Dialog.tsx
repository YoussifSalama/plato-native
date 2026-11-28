import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native <dialog> as a modal. Closing (Esc, the X, the backdrop) calls onClose. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-card p-0 text-foreground shadow-float ${wide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-base font-bold">{title}</h2>
            <button type="button" className="btn-ghost -mt-1 -mr-2 h-8 px-2" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
