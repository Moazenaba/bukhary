import type { ReactNode } from 'react';

/**
 * A row of filter chips that wraps onto more lines instead of scrolling sideways, so every
 * choice is visible at once and nothing hides off the edge of the window.
 */
export function FilterChips({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {children}
    </div>
  );
}
