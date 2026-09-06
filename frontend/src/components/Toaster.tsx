import { useEffect, useState } from 'react';

/**
 * `info` is the neutral third kind (REQ-4.7): something the user should know
 * that is not a success and not a failure — an LLM that correctly declined to
 * classify a title being the case that motivated it. Styling it as an error
 * would report a working system as a broken one.
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
// `toast.success`/`toast.error` without being wrapped in a provider, matching
// the component tree in design §6.2 where `Toaster` is a plain sibling of the
// pages, not a wrapper around them.
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

/**
 * Imperative API for raising a toast from anywhere (design §6.2). This task
 * (4.3) builds the mechanism only, with no message wired to it yet — the
 * assignee/status controls (4.5–4.7) and the phase-6 LLM failure notice
 * (REQ-4.6) are the callers.
 */
export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

/**
 * Non-modal (fixed-position overlay, doesn't block the page), auto-dismissing
 * (task 4.3 acceptance), stacking (renders every active toast) notification
 * surface. Mount once at the app root.
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
