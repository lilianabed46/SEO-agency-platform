import type { ReactNode } from "react";

/**
 * X-1 (Lilian's task list): isolates a left-to-right segment — a URL, a slug, a rule
 * code, an email — inside Arabic (RTL) text, so its internal character order can't
 * flip. `unicode-bidi: isolate` (not just `direction: ltr`) is what actually protects
 * the segment: it stops the surrounding RTL run from reordering it as a unit.
 */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`ltr-inline${className ? ` ${className}` : ""}`} dir="ltr">
      {children}
    </span>
  );
}
