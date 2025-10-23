import * as React from "react";

import { cn } from "../../lib/utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("shrink-0 bg-slate-200", className)}
      role="separator"
      {...props}
    />
  )
);

Separator.displayName = "Separator";
