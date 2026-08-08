export type ThemeMode = 'dark' | 'light';
export type AccentId = 'lime' | 'amber' | 'cyan' | 'magenta' | 'custom';

export type ThemeState = {
  mode: ThemeMode;
  accentId: AccentId;
  customHex: string;
};

const STORAGE_KEY = 'chadsound-theme';

export const ACCENT_PRESETS: { id: Exclude<AccentId, 'custom'>; label: string; hex: string; dim: string }[] = [
  { id: 'lime', label: 'Lime', hex: '#c8f135', dim: '#9bbb28' },
  { id: 'amber', label: 'Amber', hex: '#f0a830', dim: '#b87a18' },
  { id: 'cyan', label: 'Cyan', hex: '#3ecfff', dim: '#1a9fc4' },
  { id: 'magenta', label: 'Magenta', hex: '#ff4d9a', dim: '#c2185b' },
];

const DEFAULT: ThemeState = {
  mode: 'dark',
  accentId: 'lime',
  customHex: '#c8f135',
};

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '200, 241, 53';
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function dimFromHex(hex: string): string {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#9bbb28';
  const n = parseInt(full, 16);
  const r = Math.round(((n >> 16) & 255) * 0.72);
  const g = Math.round(((n >> 8) & 255) * 0.72);
  const b = Math.round((n & 255) * 0.72);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function loadTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    return {
      mode: parsed.mode === 'light' ? 'light' : 'dark',
      accentId: ACCENT_PRESETS.some((p) => p.id === parsed.accentId) || parsed.accentId === 'custom'
        ? (parsed.accentId as AccentId)
        : 'lime',
      customHex: typeof parsed.customHex === 'string' ? parsed.customHex : DEFAULT.customHex,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveTheme(state: ThemeState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resolveAccent(state: ThemeState): { hex: string; dim: string } {
  if (state.accentId === 'custom') {
    return { hex: state.customHex, dim: dimFromHex(state.customHex) };
  }
  const preset = ACCENT_PRESETS.find((p) => p.id === state.accentId) ?? ACCENT_PRESETS[0]!;
  return { hex: preset.hex, dim: preset.dim };
}

export function applyTheme(state: ThemeState): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', state.mode);
  const { hex, dim } = resolveAccent(state);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-dim', dim);
  root.style.setProperty('--lime', hex);
  root.style.setProperty('--lime-dim', dim);
  root.style.setProperty('--accent-rgb', hexToRgb(hex));
  root.style.colorScheme = state.mode;
  saveTheme(state);
}
