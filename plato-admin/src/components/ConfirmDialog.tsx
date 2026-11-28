import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a text (a reason). The promise then resolves to the text. */
  input?: { label: string; placeholder?: string; required?: boolean; minLength?: number };
};

type Confirm = {
  (o: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | null>;
  (o: ConfirmOptions): Promise<boolean>;
};

const Ctx = createContext<Confirm | null>(null);

/** One confirm dialog for the app: `const confirm = useConfirm(); if (await confirm({...})) ...` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState('');
  const resolver = useRef<((v: string | boolean | null) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setText('');
    return new Promise<string | boolean | null>((res) => {
      resolver.current = res;
    });
  }, []) as Confirm;

  const done = (v: string | boolean | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const cancel = () => done(opts?.input ? null : false);
  const min = opts?.input?.minLength ?? (opts?.input?.required ? 1 : 0);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onClose={cancel} title={opts?.title}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            done(opts?.input ? text.trim() : true);
          }}
        >
          {opts?.body && <div className="mb-4 text-sm text-text-secondary">{opts.body}</div>}
          {opts?.input && (
            <label className="mb-4 block">
              <span className="label">{opts.input.label}</span>
              <input
                autoFocus
                className="input"
                value={text}
                placeholder={opts.input.placeholder}
                minLength={min || undefined}
                required={min > 0}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={cancel}>
              Cancel
            </button>
            <button type="submit" className={opts?.danger ? 'btn-danger' : 'btn-primary'} disabled={text.trim().length < min}>
              {opts?.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </form>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfirm outside ConfirmProvider');
  return v;
}
