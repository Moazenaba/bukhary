import type { NavTab } from '../components/Sidebar';

// The open screen lives in the URL hash (#/committees), so a reload keeps it, Back returns to
// the previous screen and a link opens the right screen (WEB-17). Unknown hashes are ignored.

export const NAV_TABS: readonly NavTab[] = [
  'home', 'summer_course', 'committees', 'exams', 'ceremonies', 'calendar', 'courses', 'assistants', 'stats', 'daily_alerts', 'audit', 'availability',
];

export function tabFromHash(hash: string): NavTab | null {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (NAV_TABS as readonly string[]).includes(name) ? (name as NavTab) : null;
}

export function readTabFromHash(): NavTab | null {
  return typeof window === 'undefined' ? null : tabFromHash(window.location.hash);
}

export function writeTabToHash(tab: NavTab) {
  if (typeof window === 'undefined') return;
  const next = `#/${tab}`;
  if (window.location.hash !== next) window.location.hash = next;
}
