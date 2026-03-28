import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  message: string | null;
  durationMs: number;
}

interface ToastContextValue {
  pushToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
}

const DEFAULT_TOAST_DURATION_MS = 6000;
const ToastContext = createContext<ToastContextValue | null>(null);

function buildToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    const currentTimer = timerRef.current[id];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
      delete timerRef.current[id];
    }

    setToasts((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = buildToastId();
      const toast: ToastItem = {
        id,
        tone: input.tone ?? 'info',
        title: input.title,
        message: input.message?.trim() ? input.message : null,
        durationMs: Math.max(1200, Math.floor(input.durationMs ?? DEFAULT_TOAST_DURATION_MS))
      };

      setToasts((previous) => [...previous, toast]);

      timerRef.current[id] = window.setTimeout(() => {
        dismissToast(id);
      }, toast.durationMs);

      return id;
    },
    [dismissToast]
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      pushToast,
      dismissToast
    }),
    [dismissToast, pushToast]
  );

  useEffect(() => {
    return () => {
      Object.values(timerRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      timerRef.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-root" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast-card toast-${toast.tone}`} role="status">
            <div className="toast-content">
              <p className="toast-title">{toast.title}</p>
              {toast.message ? <p className="toast-message">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.');
  }

  return context;
}
