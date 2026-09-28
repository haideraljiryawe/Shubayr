"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Show = (message: string) => void;
const ToastContext = createContext<Show>(() => undefined);

/** One polite live region for "saved" style confirmations. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback<Show>((next) => {
    setMessage(next);
    window.setTimeout(
      () => setMessage((current) => (current === next ? null : current)),
      4000,
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      >
        {message ? (
          <p
            data-testid="toast"
            className="rounded-md bg-text px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            {message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}
