import * as React from "react";

import { cn } from "../../lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-slate-200/80",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent transition-all duration-500",
          indicatorClassName
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
);

Progress.displayName = "Progress";
