import type { ReactNode } from "react";

// Web/desktop: no native keyboard provider needed.
export function KbProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
