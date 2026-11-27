import type { SystemSettings } from '../types';

type Family = SystemSettings['font_family'];

/** The CSS name of each font the admin can choose in «إعدادات النظام». */
export const FONT_CSS_NAME: Record<Family, string> = {
  cairo: 'Cairo',
  tajawal: 'Tajawal',
  'ibm-plex-sans-arabic': 'IBM Plex Sans Arabic',
  'noto-naskh-arabic': 'Noto Naskh Arabic',
};

// Only the chosen font is downloaded, and only the weights the screens use (normal, medium,
// semibold, bold; heavier text uses bold). Each loader is a separate chunk.
const LOADERS: Record<Family, () => Promise<unknown>> = {
  cairo: () => Promise.all([import('@fontsource/cairo/400.css'), import('@fontsource/cairo/500.css'), import('@fontsource/cairo/600.css'), import('@fontsource/cairo/700.css')]),
  tajawal: () => Promise.all([import('@fontsource/tajawal/400.css'), import('@fontsource/tajawal/500.css'), import('@fontsource/tajawal/700.css')]),
  // The default font is bundled with the first page (main.tsx): nothing more to download.
  'ibm-plex-sans-arabic': () => Promise.resolve(),
  'noto-naskh-arabic': () => Promise.all([
    import('@fontsource/noto-naskh-arabic/400.css'), import('@fontsource/noto-naskh-arabic/500.css'),
    import('@fontsource/noto-naskh-arabic/600.css'), import('@fontsource/noto-naskh-arabic/700.css'),
  ]),
};

const loaded = new Set<Family>();

/** Downloads the font once (used to show real samples in «إعدادات النظام»). */
export async function loadFont(family: Family) {
  if (!FONT_CSS_NAME[family] || loaded.has(family)) return;
  await LOADERS[family]();
  loaded.add(family);
}

const REMEMBER_KEY = 'bukhari_font';

/** Loads the font (once) and makes it the font of the whole site; this device remembers it. */
export async function applyFont(family: Family) {
  if (!FONT_CSS_NAME[family]) return;
  await loadFont(family);
  document.documentElement.style.setProperty('--app-font', `'${FONT_CSS_NAME[family]}'`);
  try {
    localStorage.setItem(REMEMBER_KEY, family);
  } catch {
    // Private mode: the font is applied again once the settings load.
  }
}

/** At start-up: the font this device used last time, so the first screen does not download two fonts. */
export function applyRememberedFont() {
  try {
    const family = localStorage.getItem(REMEMBER_KEY) as Family | null;
    if (family && family !== 'ibm-plex-sans-arabic' && FONT_CSS_NAME[family]) {
      // Switch before the first paint, so the default font is never requested on this device.
      document.documentElement.style.setProperty('--app-font', `'${FONT_CSS_NAME[family]}'`);
      void loadFont(family);
    }
  } catch {
    // No storage: the default font is used until the settings load.
  }
}
