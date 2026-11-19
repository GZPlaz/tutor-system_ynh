/**
 * Branding → CSS. Loads the admin's branding (public endpoint), derives the
 * full colour scale from two picked colours, loads the chosen font pairing
 * and applies everything as CSS variables on <html>. Also sets the tab title
 * and favicon. `applyBranding()` is reused by the admin preview.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Branding {
  siteName: string;
  headline: string;
  intro: string;
  highlights: string[];
  primaryColor: string;
  accentColor: string;
  font: 'studio' | 'classic' | 'friendly' | 'system';
  corners: 'rounded' | 'soft' | 'square';
  theme: 'auto' | 'light' | 'dark';
  supportEmail: string;
  pattern: boolean;
  logo: { version: number } | null;
}

export const DEFAULT_BRANDING: Branding = {
  siteName: 'MindAccel Tutoring',
  headline: 'One-to-one tutoring that fits your week.',
  intro: 'Book live online sessions with our tutors, keep every worksheet in one place, and see exactly what is coming up next.',
  highlights: ['Live sessions on Google Meet', 'Pick times that suit you', 'All your materials in one place'],
  primaryColor: '#0E6E6A',
  accentColor: '#FFD54A',
  font: 'studio',
  corners: 'rounded',
  theme: 'auto',
  supportEmail: '',
  pattern: true,
  logo: null,
};

/** Font pairings offered in the Branding page. */
export const FONTS: Record<Branding['font'], { label: string; description: string; display: string; body: string; href: string | null }> = {
  studio: {
    label: 'Studio',
    description: 'Characterful headings, very readable text',
    display: "'Bricolage Grotesque', system-ui, sans-serif",
    body: "'Atkinson Hyperlegible', system-ui, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap',
  },
  classic: {
    label: 'Classic',
    description: 'Bookish serif headings, clean text',
    display: "'Source Serif 4', Georgia, serif",
    body: "'Source Sans 3', system-ui, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap',
  },
  friendly: {
    label: 'Friendly',
    description: 'Round and soft, good for younger learners',
    display: "'Nunito', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
  },
  system: {
    label: 'Device default',
    description: "Uses each device's own font; loads nothing from Google",
    display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    href: null,
  },
};

export const CORNERS: Record<Branding['corners'], { label: string; sm: string; md: string; lg: string }> = {
  rounded: { label: 'Rounded', sm: '8px', md: '12px', lg: '20px' },
  soft: { label: 'Soft', sm: '5px', md: '7px', lg: '10px' },
  square: { label: 'Square', sm: '2px', md: '2px', lg: '3px' },
};

// ---- colour maths -------------------------------------------------------------

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, weightOfB: number) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * weightOfB, g1 + (g2 - g1) * weightOfB, b1 + (b2 - b1) * weightOfB);
};
const luminance = (hex: string) => {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};
/** White or ink, whichever reads better on `bg`. */
export const inkOn = (bg: string) => (contrast(bg, '#FFFFFF') >= contrast(bg, '#15242B') ? '#FFFFFF' : '#15242B');

/** CSS variables for a branding. Neutrals are fixed; brand colours are derived. */
export function brandVars(b: Pick<Branding, 'primaryColor' | 'accentColor' | 'font' | 'corners'>, dark: boolean): Record<string, string> {
  const P = b.primaryColor;
  const A = b.accentColor;
  const bg = dark ? '#121C1E' : '#F6F7F4';
  // Make sure brand-coloured text stays readable on the page background.
  let text = P;
  for (let i = 0; i < 6 && contrast(text, dark ? '#1A2629' : '#FFFFFF') < 4.5; i++) text = mix(text, dark ? '#FFFFFF' : '#000000', 0.18);
  const f = FONTS[b.font];
  const c = CORNERS[b.corners];
  return {
    '--brand': P,
    '--brand-ink': inkOn(P),
    '--brand-hover': mix(P, '#000000', 0.14),
    '--brand-text': text,
    '--brand-soft': mix(P, bg, dark ? 0.78 : 0.88),
    '--brand-line': mix(P, bg, dark ? 0.6 : 0.7),
    '--accent': A,
    '--accent-ink': inkOn(A),
    '--accent-soft': mix(A, bg, dark ? 0.75 : 0.7),
    '--font-display': f.display,
    '--font-body': f.body,
    '--r-sm': c.sm,
    '--r-md': c.md,
    '--r-lg': c.lg,
  };
}

export function loadFont(font: Branding['font']) {
  const href = FONTS[font].href;
  if (!href) return;
  const id = `font-${font}`;
  if (document.getElementById(id)) return;
  const link = Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href });
  document.head.appendChild(link);
}

export const logoUrl = (b: Branding) => (b.logo ? `${import.meta.env.BASE_URL}api/branding/logo?v=${b.logo.version}` : null);

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** Apply to the whole document. */
export function applyBranding(b: Branding) {
  const root = document.documentElement;
  const dark = b.theme === 'dark' || (b.theme === 'auto' && prefersDark());
  root.dataset.theme = dark ? 'dark' : 'light';
  for (const [k, v] of Object.entries(brandVars(b, dark))) root.style.setProperty(k, v);
  loadFont(b.font);
  document.title = b.siteName;
  const href = logoUrl(b);
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (href) {
    if (!icon) {
      icon = Object.assign(document.createElement('link'), { rel: 'icon' });
      document.head.appendChild(icon);
    }
    icon.href = href;
  } else icon?.remove();
}

// ---- context --------------------------------------------------------------------

const BrandingContext = createContext<{ branding: Branding; refresh: () => Promise<void> } | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  const refresh = useCallback(async () => {
    try {
      const b = await api<Branding>('/branding');
      setBranding({ ...DEFAULT_BRANDING, ...b });
    } catch {
      /* keep defaults if the API is unreachable */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    applyBranding(branding);
    if (branding.theme !== 'auto') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyBranding(branding);
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [branding]);

  return <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}
