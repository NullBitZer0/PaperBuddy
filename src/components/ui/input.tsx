import * as React from "react";

import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 text-sm text-slate-700 shadow-inner shadow-white/40 outline-none transition focus:border-brand-primary/60 focus:shadow-[0_0_0_4px_rgba(76,110,215,0.08)]",
          "placeholder:text-slate-400",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
