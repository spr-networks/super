// Named color themes layered on top of the base gluestack config.
// `default` keeps the existing look and follows the light/dark toggle; the
// others pin a color mode and remap the neutral families + text tokens the app
// actually paints with (coolGray/blueGray/muted) plus the accent ramp, so the
// reskin is visible everywhere rather than only on a few semantic aliases.
// Palettes are ported from QubitSphere.

export const DEFAULT_THEME = 'default'

export const themes = {
  default: {
    name: 'Default',
    colorMode: null,
    swatch: { bg: '#1f2937', accent: '#64748b' },
    colors: {}
  },

  lab: {
    name: 'Lab Instrument',
    colorMode: 'dark',
    swatch: { bg: '#0F2035', accent: '#FFB347' },
    colors: {
      // accent — amber
      primary50: '#FFF6E9',
      primary100: '#FFE9C8',
      primary200: '#FFD79B',
      primary300: '#FFC670',
      primary400: '#FFB347',
      primary500: '#F0A233',
      primary600: '#D9821A',
      primary700: '#B0670F',
      primary800: '#834C0B',
      primary900: '#573208',

      // dark neutral surfaces -> navy
      black: '#060E1A',
      blueGray900: '#060E1A',
      blueGray800: '#0F2035',
      blueGray700: '#16304F',
      coolGray900: '#0F2035',
      coolGray800: '#16304F',
      coolGray700: '#24466E',

      // light-end neutrals used as text/icons on dark -> cool white/slate
      muted50: '#EAF1F8',
      muted100: '#D8E6F2',
      muted200: '#B9CDE0',
      muted300: '#9DB4CC',
      muted400: '#7F99B4',
      muted500: '#8AA1BA',

      // default Text/Heading color ramp (dark mode) -> cool light
      textDark0: '#FFFFFF',
      textDark50: '#EAF3FB',
      textDark100: '#DCE9F5',
      textDark200: '#C4D6E8',
      textDark300: '#A8C0D8',
      textDark400: '#8AA6C0',
      textDark500: '#7C97B2',

      backgroundContentDark: '#060E1A',
      backgroundCardDark: '#0F2035',
      borderColorCardDark: '#24466E',
      sidebarBackgroundDark: '#0A1626',
      navbarBackgroundDark: '#0A1626',
      navbarBorderColorDark: '#24466E',
      navbarTextColorDark: '#9DB4CC'
    }
  },

  editorial: {
    name: 'Editorial',
    colorMode: 'light',
    swatch: { bg: '#F4EFE6', accent: '#A63A2A' },
    colors: {
      // accent — terracotta
      primary50: '#F7EBE7',
      primary100: '#E8CFC7',
      primary200: '#D9AEA1',
      primary300: '#C88B7A',
      primary400: '#B85E48',
      primary500: '#A63A2A',
      primary600: '#8F3123',
      primary700: '#75281C',
      primary800: '#5A1F16',
      primary900: '#3F150F',

      // light neutral surfaces + pills/badges -> warm paper
      coolGray50: '#EFE8DA',
      coolGray100: '#E4DAC8',
      coolGray200: '#D8CEBB',
      warmGray50: '#F4EFE6',
      warmGray100: '#E9E0D0',
      blueGray100: '#EBE4D5',
      blueGray200: '#E0D6C4',
      blueGray300: '#D2C6B0',
      blueGray400: '#BCAE93',
      muted100: '#EFE8DA',
      muted200: '#E4DBC9',
      muted300: '#D8CEBB',

      // text -> near-black brown
      muted500: '#6E655A',
      muted800: '#2A2420',
      muted900: '#1A1712',

      // default Text/Heading color ramp (light mode) -> warm near-black
      textLight400: '#8A8073',
      textLight500: '#6E655A',
      textLight600: '#4A4238',
      textLight700: '#2A2420',
      textLight900: '#1A1712',

      backgroundContentLight: '#F4EFE6',
      backgroundCardLight: '#EBE4D5',
      borderColorCardLight: '#D8CEBB',
      sidebarBackgroundLight: '#EDE6D8',
      navbarBackgroundLight: '#F4EFE6',
      navbarBorderColorLight: '#D8CEBB',
      navbarTextColorLight: '#6A6258'
    }
  },

  crt: {
    name: 'CRT Phosphor',
    colorMode: 'dark',
    swatch: { bg: '#020400', accent: '#A8FF60' },
    colors: {
      // accent — phosphor green
      primary50: '#EBFFDA',
      primary100: '#CFFFB0',
      primary200: '#B4FF80',
      primary300: '#A8FF60',
      primary400: '#7FDB3C',
      primary500: '#5CB524',
      primary600: '#3A7A12',
      primary700: '#2C5C0E',
      primary800: '#1F420A',
      primary900: '#142B07',

      // dark neutral surfaces -> pure/near black
      black: '#000000',
      blueGray900: '#000000',
      blueGray800: '#0A140A',
      blueGray700: '#16301A',
      coolGray900: '#050A05',
      coolGray800: '#0E1E0E',
      coolGray700: '#16301A',

      // text/icons on dark -> phosphor green
      muted50: '#E9FFD6',
      muted100: '#CFFFB0',
      muted200: '#A8FF60',
      muted300: '#86E23F',
      muted400: '#63C41F',
      muted500: '#66C42B',
      muted600: '#4E9E19',

      // default Text/Heading color ramp (dark mode) -> phosphor green
      textDark0: '#D6FFB8',
      textDark50: '#C6FFA0',
      textDark100: '#B4FF80',
      textDark200: '#A8FF60',
      textDark300: '#93EE50',
      textDark400: '#7FD840',
      textDark500: '#6BC42F',

      backgroundContentDark: '#000000',
      backgroundCardDark: '#050A05',
      borderColorCardDark: '#1C3A1C',
      sidebarBackgroundDark: '#000000',
      navbarBackgroundDark: '#000000',
      navbarBorderColorDark: '#1C3A1C',
      navbarTextColorDark: '#7FFF4F'
    }
  },

  tangerine: {
    name: 'Tangerine',
    colorMode: 'dark',
    swatch: { bg: '#F97316', accent: '#FFB347' },
    colors: {
      // accent — warm amber/sunset
      primary50: '#fff4e3',
      primary100: '#ffeacb',
      primary200: '#ffddac',
      primary300: '#ffcb82',
      primary400: '#FFB347',
      primary500: '#e09e3e',
      primary600: '#b88133',
      primary700: '#946829',
      primary800: '#704f1f',
      primary900: '#4d3615',

      // dark neutral surfaces -> tangerine/red sunset
      black: '#F97316',
      blueGray900: '#EF4444',
      blueGray800: '#f04f4f',
      blueGray700: '#f15a5a',
      blueGray600: '#f26666',
      blueGray500: '#f37171',
      coolGray900: '#EF4444',
      coolGray800: '#f04f4f',
      coolGray700: '#f15a5a',
      // sidebar icons ($coolGray400) + text ($coolGray300) -> cream on orange
      coolGray600: '#fcb98b',
      coolGray500: '#fcc49d',
      coolGray400: '#fdcead',
      coolGray300: '#fee3d0',

      // light-end neutrals used as text/icons on warm -> cream
      muted50: '#ffffff',
      muted100: '#FFFFFF',
      muted200: '#fee3d0',
      muted300: '#fdcead',
      muted400: '#fcb98b',
      muted500: '#fcc49d',
      muted600: '#fcb27f',
      muted700: '#fb9d5c',
      muted800: '#fa8839',
      muted900: '#F97316',

      // default Text/Heading color ramp (dark mode) -> warm cream
      textDark0: '#ffffff',
      textDark50: '#ffffff',
      textDark100: '#FFFFFF',
      textDark200: '#FFFFFF',
      textDark300: '#fee3d0',
      textDark400: '#fdcead',
      textDark500: '#fcc096',

      // muted <Badge action="muted"> -> themed pill (bg/border/text)
      backgroundDarkMuted: '#e06814',
      secondary700: '#a24b0e',
      secondary600: '#fcc096',
      secondary400: '#fdcead',
      secondary300: '#fee3d0',

      backgroundContentDark: '#F97316',
      backgroundCardDark: '#EF4444',
      borderColorCardDark: '#f26666',
      sidebarBackgroundDark: '#f45c2d',
      navbarBackgroundDark: '#F97316',
      navbarBorderColorDark: '#f26666',
      navbarTextColorDark: '#fdc7a2'
    }
  },

  blueprint: {
    name: 'Blueprint',
    colorMode: 'dark',
    swatch: { bg: '#0A1B2E', accent: '#38BDF8' },
    colors: {
      // accent — cyan ink
      primary50: '#E8F6FE',
      primary100: '#C7EBFD',
      primary200: '#9BDBFB',
      primary300: '#6BC9F9',
      primary400: '#38BDF8',
      primary500: '#1BA3E6',
      primary600: '#1580BE',
      primary700: '#12648F',
      primary800: '#0E4A6B',
      primary900: '#0A3149',

      // dark neutral surfaces -> blueprint navy
      black: '#081726',
      blueGray900: '#081726',
      blueGray800: '#0E2540',
      blueGray700: '#153458',
      coolGray900: '#0E2540',
      coolGray800: '#153458',
      coolGray700: '#22456B',

      // light-end neutrals used as text/icons on navy -> chalk/cool
      muted50: '#EEF6FC',
      muted100: '#DCEAF7',
      muted200: '#BBD3E8',
      muted300: '#9FBCD8',
      muted400: '#7FA8C9',
      muted500: '#8FB0CE',

      // default Text/Heading color ramp (dark mode) -> chalk white
      textDark0: '#FFFFFF',
      textDark50: '#EAF4FC',
      textDark100: '#DCEAF7',
      textDark200: '#C4DBEF',
      textDark300: '#A8C7E2',
      textDark400: '#8AAFD0',
      textDark500: '#7FA8C9',

      backgroundContentDark: '#0A1B2E',
      backgroundCardDark: '#0E2540',
      borderColorCardDark: '#22456B',
      sidebarBackgroundDark: '#081C30',
      navbarBackgroundDark: '#0A1B2E',
      navbarBorderColorDark: '#22456B',
      navbarTextColorDark: '#9FBCD8'
    }
  },

  blueprint_light: {
    name: 'Blueprint Light',
    colorMode: 'light',
    swatch: { bg: '#E9F1F8', accent: '#1668B0' },
    colors: {
      // accent — blue ink
      primary50: '#E9F2FB',
      primary100: '#CBE0F5',
      primary200: '#A6CAEC',
      primary300: '#79ADDF',
      primary400: '#4A8ECF',
      primary500: '#2A74B8',
      primary600: '#1668B0',
      primary700: '#114E86',
      primary800: '#0D3A63',
      primary900: '#0A2C4A',

      // light neutral surfaces + pills/badges -> cool blue paper
      coolGray50: '#EEF4FA',
      coolGray100: '#E3EDF6',
      coolGray200: '#D3E1EE',
      warmGray50: '#F0F5FA',
      warmGray100: '#DCE8F3',
      blueGray100: '#E3EDF6',
      blueGray200: '#D3E1EE',
      blueGray300: '#BBD1E6',
      blueGray400: '#89ACCC',
      muted100: '#EEF4FA',
      muted200: '#DFEAF4',
      muted300: '#CFDFEE',

      // text -> dark navy ink
      muted500: '#5A7794',
      muted800: '#143049',
      muted900: '#0E2540',

      // default Text/Heading color ramp (light mode) -> navy ink
      textLight400: '#7E97AE',
      textLight500: '#5A7794',
      textLight600: '#2E5474',
      textLight700: '#143049',
      textLight900: '#0E2540',

      backgroundContentLight: '#E9F1F8',
      backgroundCardLight: '#F4F8FC',
      borderColorCardLight: '#C2D5E8',
      sidebarBackgroundLight: '#E4EEF7',
      navbarBackgroundLight: '#EDF3F9',
      navbarBorderColorLight: '#C2D5E8',
      navbarTextColorLight: '#5A7794'
    }
  },

  whitestone: {
    name: 'WhiteStone',
    colorMode: 'light',
    swatch: { bg: '#FFFFFF', accent: '#0A5FE0' },
    colors: {
      // accent — refined enterprise blue
      primary50: '#EBF3FF',
      primary100: '#D3E4FF',
      primary200: '#A9C9FF',
      primary300: '#7BA9FB',
      primary400: '#4A87F5',
      primary500: '#1F6BEA',
      primary600: '#0A5FE0',
      primary700: '#0A4CB0',
      primary800: '#093B87',
      primary900: '#0A2C5F',

      // light neutral surfaces + pills/badges -> crisp cool greys
      coolGray50: '#F6F7F9',
      coolGray100: '#EEF0F3',
      coolGray200: '#E3E6EA',
      warmGray50: '#FFFFFF',
      warmGray100: '#EDEFF2',
      blueGray100: '#EEF1F5',
      blueGray200: '#E3E7EC',
      blueGray300: '#CDD5DE',
      blueGray400: '#98A2AE',
      muted100: '#F4F6F8',
      muted200: '#E9ECF0',
      muted300: '#DCE0E6',

      // text -> near-black cool
      muted500: '#5A6169',
      muted800: '#22262B',
      muted900: '#14171A',

      // default Text/Heading color ramp (light mode) -> near-black
      textLight400: '#8A9199',
      textLight500: '#5A6169',
      textLight600: '#3A4046',
      textLight700: '#22262B',
      textLight900: '#14171A',

      // crisp white cards on a light-grey canvas, hairline borders
      backgroundContentLight: '#F6F7F9',
      backgroundCardLight: '#FFFFFF',
      borderColorCardLight: '#E3E6EA',
      sidebarBackgroundLight: '#FFFFFF',
      navbarBackgroundLight: '#FFFFFF',
      navbarBorderColorLight: '#E9ECF0',
      navbarTextColorLight: '#5A6169'
    }
  }
}

const THEME_ORDER = [
  'editorial',
  'crt',
  'tangerine',
  'blueprint',
  'blueprint_light',
  'whitestone',
  'lab'
]

// The default theme follows the light/dark toggle rather than pinning a mode,
// so the picker surfaces it as two explicit entries ("Default Light" /
// "Default Dark"). Each entry carries a composite `key` so the menu can keep
// them distinct, plus the `colorMode` the picker should apply when selected.
const DEFAULT_ENTRIES = [
  {
    key: 'default:light',
    id: 'default',
    name: 'Default Light',
    colorMode: 'light',
    swatch: { bg: '#ffffff', accent: '#64748b' }
  },
  {
    key: 'default:dark',
    id: 'default',
    name: 'Default Dark',
    colorMode: 'dark',
    swatch: { bg: '#1f2937', accent: '#64748b' }
  }
]

export const themeList = [
  ...DEFAULT_ENTRIES,
  ...THEME_ORDER.filter((id) => themes[id]).map((id) => ({
    key: id,
    id,
    name: themes[id].name,
    colorMode: themes[id].colorMode,
    swatch: themes[id].swatch
  }))
]

// Stable key for the picker's selected state. The default theme splits into a
// light/dark entry, so it needs the current colorMode to disambiguate; every
// other theme is keyed by its id.
export const themeKeyFor = (theme, colorMode) => {
  if (!theme || theme === 'default') {
    return `default:${colorMode || 'light'}`
  }
  return theme
}

// ---------------------------------------------------------------------------
// Custom (user-built) theme
// ---------------------------------------------------------------------------
// The built-in themes are registered with gluestack at boot. A user's theme is
// defined at runtime, so its token scope is injected live (see App) rather than
// through config.themes. From four picks + a base mode we derive the full token
// map, mirroring the keys the built-in themes set so every surface is covered.

export const CUSTOM_THEME_ID = 'custom'

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))

const hexToRgb = (hex) => {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  let n = parseInt(h, 16)
  if (isNaN(n) || h.length !== 6) return { r: 0, g: 0, b: 0 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const rgbToHex = ({ r, g, b }) => {
  let s = (v) => clamp(v).toString(16).padStart(2, '0')
  return '#' + s(r) + s(g) + s(b)
}

// blend a toward b by t (0..1)
const mix = (a, b, t) => {
  let ca = hexToRgb(a)
  let cb = hexToRgb(b)
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t
  })
}

const lighten = (hex, t) => mix(hex, '#ffffff', t)
const darken = (hex, t) => mix(hex, '#000000', t)

const accentRamp = (accent) => ({
  primary50: lighten(accent, 0.85),
  primary100: lighten(accent, 0.72),
  primary200: lighten(accent, 0.55),
  primary300: lighten(accent, 0.32),
  primary400: accent,
  primary500: darken(accent, 0.12),
  primary600: darken(accent, 0.28),
  primary700: darken(accent, 0.42),
  primary800: darken(accent, 0.56),
  primary900: darken(accent, 0.7)
})

// Produce a full token override map from the four picks + base mode.
export const deriveCustomColors = ({
  colorMode,
  accent,
  background,
  card,
  text
}) => {
  let base = { ...accentRamp(accent) }

  if (colorMode === 'dark') {
    return {
      ...base,
      black: background,
      blueGray900: card,
      blueGray800: lighten(card, 0.06),
      blueGray700: lighten(card, 0.12),
      blueGray600: lighten(card, 0.18),
      blueGray500: lighten(card, 0.24),
      coolGray900: card,
      coolGray800: lighten(card, 0.06),
      coolGray700: lighten(card, 0.12),
      // sidebar icons ($coolGray400) + text ($coolGray300) -> cream on themed bg
      coolGray600: mix(text, background, 0.55),
      coolGray500: mix(text, background, 0.45),
      coolGray400: mix(text, background, 0.35),
      coolGray300: mix(text, background, 0.2),

      muted50: lighten(text, 0.1),
      muted100: text,
      muted200: mix(text, background, 0.2),
      muted300: mix(text, background, 0.35),
      muted400: mix(text, background, 0.5),
      muted500: mix(text, background, 0.42),
      muted600: mix(text, background, 0.55),
      muted700: mix(text, background, 0.7),
      muted800: mix(text, background, 0.85),
      muted900: background,

      textDark0: lighten(text, 0.15),
      textDark50: lighten(text, 0.08),
      textDark100: text,
      textDark200: text,
      textDark300: mix(text, background, 0.2),
      textDark400: mix(text, background, 0.35),
      textDark500: mix(text, background, 0.45),

      // muted <Badge action="muted"> -> themed pill (bg/border/text)
      backgroundDarkMuted: darken(background, 0.1),
      secondary700: darken(background, 0.35),
      secondary600: mix(text, background, 0.45),
      secondary400: mix(text, background, 0.35),
      secondary300: mix(text, background, 0.2),

      backgroundContentDark: background,
      backgroundCardDark: card,
      borderColorCardDark: mix(card, text, 0.18),
      sidebarBackgroundDark: mix(background, card, 0.5),
      navbarBackgroundDark: background,
      navbarBorderColorDark: mix(card, text, 0.18),
      navbarTextColorDark: mix(text, background, 0.4)
    }
  }

  return {
    ...base,
    white: card,
    coolGray50: background,
    coolGray100: darken(background, 0.03),
    coolGray200: darken(background, 0.06),
    coolGray300: darken(mix(card, background, 0.5), 0.14),
    coolGray400: mix(text, background, 0.45),
    coolGray500: darken(mix(card, background, 0.5), 0.22),
    coolGray600: darken(mix(card, background, 0.5), 0.3),
    warmGray50: card,
    warmGray100: darken(card, 0.05),
    blueGray100: mix(card, background, 0.5),
    blueGray200: darken(mix(card, background, 0.5), 0.05),
    blueGray300: darken(mix(card, background, 0.5), 0.14),
    blueGray400: mix(text, background, 0.45),
    blueGray500: darken(mix(card, background, 0.5), 0.22),
    blueGray600: darken(mix(card, background, 0.5), 0.3),
    muted100: background,
    muted200: darken(background, 0.04),
    muted300: darken(background, 0.09),
    muted400: mix(text, background, 0.7),

    muted500: mix(text, background, 0.4),
    muted600: mix(text, background, 0.25),
    muted700: mix(text, background, 0.12),
    muted800: text,
    muted900: darken(text, 0.2),

    textLight400: mix(text, background, 0.45),
    textLight500: mix(text, background, 0.4),
    textLight600: mix(text, background, 0.2),
    textLight700: text,
    textLight900: darken(text, 0.15),

    // muted <Badge action="muted"> -> themed pill (bg/border/text)
    backgroundLightMuted: darken(background, 0.03),
    secondary300: darken(mix(card, background, 0.5), 0.14),
    secondary600: darken(mix(card, background, 0.5), 0.3),

    backgroundContentLight: background,
    backgroundCardLight: card,
    borderColorCardLight: mix(card, text, 0.12),
    sidebarBackgroundLight: mix(background, card, 0.5),
    navbarBackgroundLight: card,
    navbarBorderColorLight: mix(card, text, 0.12),
    navbarTextColorLight: mix(text, background, 0.4)
  }
}

// Starting point when a user first opens the builder.
export const DEFAULT_CUSTOM = {
  colorMode: 'dark',
  accent: '#38BDF8',
  background: '#0F1729',
  card: '#182136',
  text: '#E2E8F5'
}

// Identifiers for user-built themes are slugified from the name and prefixed
// so they can never collide with a built-in theme id.
export const customIdForName = (name) => {
  let s = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return 'custom-' + (s || 'theme')
}

// Specs can arrive from the API or persisted settings; anything not a
// plain hex color falls back to the default.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const sanitizeSpec = (spec) => {
  let s = { ...DEFAULT_CUSTOM, ...(spec || {}) }
  for (let k of ['accent', 'background', 'card', 'text']) {
    if (typeof s[k] !== 'string' || !HEX_COLOR.test(s[k])) {
      s[k] = DEFAULT_CUSTOM[k]
    }
  }
  s.colorMode = s.colorMode === 'light' ? 'light' : 'dark'
  return s
}

// Build the runtime record for a custom theme spec (picks + derived colors).
export const buildCustomTheme = (spec, name = 'Custom') => {
  let s = sanitizeSpec(spec)
  return {
    name: name || 'Custom',
    colorMode: s.colorMode,
    swatch: { bg: s.background, accent: s.accent },
    spec: s,
    colors: deriveCustomColors(s)
  }
}

// CSS for the runtime-injected custom theme scope (see App). `id` is the
// data-theme-id attribute used to scope tokens (matches <Theme name={id}>).
// Values and id are re-validated here so no caller can inject CSS.
export const customThemeCss = (customTheme, id = CUSTOM_THEME_ID) => {
  if (!customTheme || !customTheme.colors) return ''
  if (!/^[a-z0-9-]{1,72}$/.test(id)) return ''
  let body = Object.keys(customTheme.colors)
    .filter((k) => /^[a-zA-Z0-9]+$/.test(k))
    .filter((k) => HEX_COLOR.test(customTheme.colors[k]))
    .map((k) => `--colors-${k}: ${customTheme.colors[k]};`)
    .join(' ')
  return body ? `[data-theme-id="${id}"] { ${body} }` : ''
}

// Representative surface colors for a theme's mini preview (built-in or
// custom). Falls back to gluestack-ish defaults when a theme omits tokens
// (e.g. the `default` theme, which carries no overrides).
const PREVIEW_FALLBACK = {
  light: {
    page: '#f5f5f5',
    side: '#f1f5f9',
    navbar: '#ffffff',
    card: '#ffffff',
    text: '#11181c',
    accent: '#64748b',
    border: '#e5e7eb'
  },
  dark: {
    page: '#0f172a',
    side: '#0b1220',
    navbar: '#0b1220',
    card: '#1e293b',
    text: '#f8fafc',
    accent: '#64748b',
    border: '#1f2937'
  }
}

const cap = (m) => m.charAt(0).toUpperCase() + m.slice(1)

export const previewColorsFor = (record) => {
  if (!record) return PREVIEW_FALLBACK.light
  let mode = record.colorMode === 'light' ? 'light' : 'dark'
  let c = record.colors || {}
  let g = (k) => c[k]
  let fb = PREVIEW_FALLBACK[mode]
  let val = (...keys) => {
    for (let k of keys) {
      let v = g(k)
      if (v && HEX_COLOR.test(v)) return v
    }
    return null
  }
  return {
    page:
      val(
        `backgroundContent${cap(mode)}`,
        mode === 'dark' ? 'black' : 'coolGray50'
      ) || fb.page,
    side: val(`sidebarBackground${cap(mode)}`) || fb.side,
    navbar: val(`navbarBackground${cap(mode)}`) || fb.navbar,
    card:
      val(
        `backgroundCard${cap(mode)}`,
        mode === 'dark' ? 'blueGray900' : 'coolGray50'
      ) || fb.card,
    text:
      (mode === 'dark'
        ? val('textDark100', 'textDark50')
        : val('textLight900', 'textLight600')) || fb.text,
    accent: val('primary400') || fb.accent,
    border: val(`borderColorCard${cap(mode)}`) || fb.border
  }
}
