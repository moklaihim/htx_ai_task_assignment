import { useEffect, useState } from 'react';

/**
 * `info` is the neutral third kind: something the user should know that is
 * not a success and not a failure — e.g. an LLM that correctly declined to
 * classify a title. Styling it as an error would report a working system as
 * a broken one.
 */
type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

const AUTO_DISMISS_MS = 14000;

// Module-level store rather than React context: any component can call
// `toast.success`/`toast.error` without being wrapped in a provider.
let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
}

/** Imperative API for raising a toast from anywhere. */
export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

/**
 * Non-modal, auto-dismissing, stacking notification surface. Mount once at
 * the app root.
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div role="status" aria-live="polite" className="toaster">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast--${item.kind}`}
          data-testid="toast"
          data-kind={item.kind}
        >
          <span className="toast__message">{item.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
