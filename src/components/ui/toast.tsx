import { ShieldCheck, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type ToastProps = {
  open: boolean;
  onDismiss?: () => void;
  children: ReactNode;
};

export function Toast({ open, onDismiss, children }: ToastProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-6 left-1/2 z-[70] w-[90vw] max-w-lg -translate-x-1/2",
        "rounded-3xl border border-slate-200 bg-white/95 px-6 py-4 shadow-[0_25px_50px_rgba(15,23,42,0.15)] backdrop-blur",
        "transition-all duration-200 ease-out"
      )}
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="flex-1 text-left text-sm text-slate-700">{children}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full bg-slate-900/5 p-1.5 text-slate-500 transition hover:text-slate-700"
            aria-label="Dismiss toast"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
