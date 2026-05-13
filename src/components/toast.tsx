"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastAPI = {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const v = useContext(ToastCtx);
  if (!v) {
    // Fallback no-op so callers don't explode outside the provider.
    return {
      success: (m) => console.info("[toast]", m),
      error: (m) => console.error("[toast]", m),
      info: (m) => console.log("[toast]", m),
      dismiss: () => {},
    };
  }
  return v;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() * 1000 + nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const api = useMemo<ToastAPI>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
      dismiss: (id) => setToasts((p) => p.filter((t) => t.id !== id)),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={(id) => api.dismiss(id)} />
    </ToastCtx.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const tone = toastTone(toast.kind);
  const Icon = toastIcon(toast.kind);

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] shadow-lg"
      style={{
        background: "var(--surface)",
        color: "var(--text)",
        borderLeft: `3px solid ${tone.accent}`,
        boxShadow:
          "0 12px 24px -6px rgba(0,0,0,0.35), 0 0 0 1px var(--border)",
        transform: visible ? "translateX(0)" : "translateX(16px)",
        opacity: visible ? 1 : 0,
        transition: "transform 180ms ease-out, opacity 180ms ease-out",
      }}
    >
      <span
        className="mt-0.5 inline-flex items-center justify-center"
        style={{ color: tone.accent }}
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="flex-1 leading-[1.45]" style={{ whiteSpace: "pre-line" }}>
        {toast.message}
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 p-1 transition-colors"
        style={{ color: "var(--text-faint)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

function toastTone(kind: ToastKind): { accent: string } {
  switch (kind) {
    case "success":
      return { accent: "var(--success)" };
    case "error":
      return { accent: "var(--danger)" };
    default:
      return { accent: "var(--primary, #0ea5e9)" };
  }
}

function toastIcon(kind: ToastKind) {
  switch (kind) {
    case "success":
      return CheckCircle2;
    case "error":
      return XCircle;
    default:
      return Info;
  }
}
