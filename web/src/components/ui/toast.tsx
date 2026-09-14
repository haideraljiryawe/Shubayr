"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Minimal toast. Deliberately tiny and self-contained: it exists so the product
 * page can confirm "added to cart" before the cart itself lands in Phase 5.
 * Swapping it for real cart feedback means changing the `showToast` call, not
 * the components around it.
 *
 * The live region is always mounted (rather than mounted on demand) so screen
 * readers announce the message when it appears.
 */

type ToastContextValue = (message: string) => void;

const ToastContext = createContext<ToastContextValue>(() => {});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const VISIBLE_MS = 2800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8"
      >
        {message ? (
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-md px-4 py-3",
              "bg-primary-dark text-on-primary shadow-lg",
              "text-sm font-medium",
            )}
          >
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
