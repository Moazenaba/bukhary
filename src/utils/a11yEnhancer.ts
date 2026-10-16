/**
 * Global accessibility layer for dialogs and icon-only controls.
 * - Names generic dialogs from their first heading, moves focus in, traps Tab, restores focus on close.
 * - Gives icon-only buttons an accessible name from their title, and hides icon ligatures from screen readers.
 */
const GENERIC_LABELS = new Set(['', 'نافذة']);
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const seenDialogs = new WeakSet<Element>();
const focusStack: { dialog: Element; opener: Element | null }[] = [];

const visibleText = (el: Element) => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('.material-symbols-outlined').forEach((i) => i.remove());
  return (clone.textContent ?? '').trim();
};

function enhanceDialog(dialog: HTMLElement) {
  if (seenDialogs.has(dialog)) return;
  seenDialogs.add(dialog);

  if (GENERIC_LABELS.has((dialog.getAttribute('aria-label') ?? '').trim())) {
    const heading = dialog.querySelector('h1,h2,h3,h4');
    const text = heading ? visibleText(heading) : '';
    if (text) dialog.setAttribute('aria-label', text);
  }

  const opener = document.activeElement;
  focusStack.push({ dialog, opener });
  if (!dialog.contains(document.activeElement)) {
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
    else {
      dialog.tabIndex = -1;
      dialog.focus({ preventScroll: true });
    }
  }
}

function enhanceButtons(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.material-symbols-outlined:not([aria-hidden])').forEach((i) => {
    i.setAttribute('aria-hidden', 'true');
  });
  root.querySelectorAll<HTMLButtonElement>('button:not([aria-label]):not([aria-labelledby])').forEach((b) => {
    if (visibleText(b)) return;
    const title = b.getAttribute('title');
    if (title) b.setAttribute('aria-label', title);
  });
}

function pruneStack() {
  for (let i = focusStack.length - 1; i >= 0; i--) {
    const entry = focusStack[i];
    if (!document.contains(entry.dialog)) {
      focusStack.splice(i, 1);
      if (i === focusStack.length && entry.opener instanceof HTMLElement && document.contains(entry.opener)) {
        entry.opener.focus({ preventScroll: true });
      }
    }
  }
}

export function installA11yEnhancer() {
  if (typeof document === 'undefined') return;
  let scheduled = false;
  const run = () => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(enhanceDialog);
    enhanceButtons(document);
    pruneStack();
  };
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || focusStack.length === 0) return;
    const dialog = focusStack[focusStack.length - 1].dialog;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  run();
}
