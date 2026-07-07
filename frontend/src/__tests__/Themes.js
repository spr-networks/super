import 'react-native'
import React from 'react'
import { render, screen } from 'test-utils'

import {
  themes,
  themeList,
  themeKeyFor,
  CUSTOM_THEME_ID,
  customIdForName,
  buildCustomTheme,
  deriveCustomColors,
  customThemeCss,
  mergeCustomThemes,
  previewColorsFor,
  DEFAULT_CUSTOM,
  DEFAULT_THEME
} from 'Themes'
import { config as baseConfig } from 'gluestack-ui.config'

import ThemePreview from 'components/ThemePreview'

describe('Themes.themeList', () => {
  test('splits default into Default Light / Default Dark entries', () => {
    expect(themeList.length).toBeGreaterThanOrEqual(2)
    const first = themeList[0]
    expect(first.key).toBe('default:light')
    expect(first.id).toBe('default')
    expect(first.name).toBe('Default Light')
    expect(first.colorMode).toBe('light')

    const second = themeList[1]
    expect(second.key).toBe('default:dark')
    expect(second.id).toBe('default')
    expect(second.name).toBe('Default Dark')
    expect(second.colorMode).toBe('dark')
  })

  test('includes built-in themes by their id as key', () => {
    const keys = themeList.map((t) => t.key)
    for (let id of [
      'editorial',
      'crt',
      'tangerine',
      'blueprint',
      'blueprint_light',
      'whitestone',
      'lab'
    ]) {
      expect(keys).toContain(id)
    }
  })

  test('every entry carries key/id/name/colorMode/swatch', () => {
    for (let t of themeList) {
      expect(typeof t.key).toBe('string')
      expect(typeof t.id).toBe('string')
      expect(typeof t.name).toBe('string')
      expect(['light', 'dark']).toContain(t.colorMode)
      expect(t.swatch).toBeTruthy()
      expect(typeof t.swatch.bg).toBe('string')
      expect(typeof t.swatch.accent).toBe('string')
    }
  })
})

describe('Themes.themeKeyFor', () => {
  test('default is keyed with its colorMode', () => {
    expect(themeKeyFor('default', 'light')).toBe('default:light')
    expect(themeKeyFor('default', 'dark')).toBe('default:dark')
  })

  test('default falls back to light when no mode given', () => {
    expect(themeKeyFor('default')).toBe('default:light')
    expect(themeKeyFor(null)).toBe('default:light')
    expect(themeKeyFor(undefined)).toBe('default:light')
  })

  test('named themes are keyed by their id', () => {
    expect(themeKeyFor('lab', 'dark')).toBe('lab')
    expect(themeKeyFor('tangerine', 'dark')).toBe('tangerine')
    expect(themeKeyFor('editorial', 'light')).toBe('editorial')
  })
})

describe('Themes.customIdForName', () => {
  test('slugifies the name and prefixes custom-', () => {
    expect(customIdForName('My Theme')).toBe('custom-my-theme')
    expect(customIdForName('Lab Instrument')).toBe('custom-lab-instrument')
    expect(customIdForName('a!!!b')).toBe('custom-a-b')
    expect(customIdForName('  spaced  ')).toBe('custom-spaced')
  })

  test('falls back to custom-theme for empty input', () => {
    expect(customIdForName('')).toBe('custom-theme')
    expect(customIdForName(null)).toBe('custom-theme')
    expect(customIdForName('   ')).toBe('custom-theme')
  })
})

describe('Themes.buildCustomTheme / sanitizeSpec', () => {
  test('returns name, colorMode, swatch, spec and derived colors', () => {
    let t = buildCustomTheme(
      {
        colorMode: 'dark',
        accent: '#38BDF8',
        background: '#0F1729',
        card: '#182136',
        text: '#E2E8F5'
      },
      'Sunset'
    )
    expect(t.name).toBe('Sunset')
    expect(t.colorMode).toBe('dark')
    expect(t.swatch).toEqual({ bg: '#0F1729', accent: '#38BDF8' })
    expect(t.spec).toBeTruthy()
    expect(t.colors).toBeTruthy()
    expect(t.colors.primary400).toBe('#38BDF8')
  })

  test('default name when none provided', () => {
    let t = buildCustomTheme({ colorMode: 'dark' })
    expect(t.name).toBe('Custom')
  })

  test('invalid hex picks fall back to DEFAULT_CUSTOM', () => {
    let t = buildCustomTheme(
      {
        colorMode: 'dark',
        accent: 'not-a-color',
        background: 'oops',
        card: '#111111',
        text: 'zzz'
      },
      'Bad'
    )
    expect(t.spec.accent).toBe(DEFAULT_CUSTOM.accent)
    expect(t.spec.background).toBe(DEFAULT_CUSTOM.background)
    expect(t.spec.text).toBe(DEFAULT_CUSTOM.text)
    expect(t.spec.card).toBe('#111111')
  })

  test('unknown colorMode coerces to dark', () => {
    let t = buildCustomTheme({ colorMode: 'weird' })
    expect(t.colorMode).toBe('dark')
  })

  test('light colorMode is preserved', () => {
    let t = buildCustomTheme({
      colorMode: 'light',
      accent: '#0A5FE0',
      background: '#F4EFE6',
      card: '#EBE4D5',
      text: '#1A1712'
    })
    expect(t.colorMode).toBe('light')
  })
})

describe('Themes.deriveCustomColors (dark)', () => {
  const d = deriveCustomColors({
    colorMode: 'dark',
    accent: '#38BDF8',
    background: '#0F1729',
    card: '#182136',
    text: '#E2E8F5'
  })

  test('accent ramp primary400 === accent', () => {
    expect(d.primary400).toBe('#38BDF8')
    expect(d.primary50).not.toBe(d.primary900)
  })

  test('emits cream sidebar tokens (coolGray300-600)', () => {
    for (let k of ['coolGray300', 'coolGray400', 'coolGray500', 'coolGray600']) {
      expect(typeof d[k]).toBe('string')
      expect(d[k]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('emits muted Badge pill tokens (backgroundDarkMuted + secondary*)', () => {
    for (let k of [
      'backgroundDarkMuted',
      'secondary300',
      'secondary400',
      'secondary600',
      'secondary700'
    ]) {
      expect(typeof d[k]).toBe('string')
      expect(d[k]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('background surfaces map to picks', () => {
    expect(d.backgroundContentDark).toBe('#0F1729')
    expect(d.backgroundCardDark).toBe('#182136')
    expect(d.muted900).toBe('#0F1729')
    expect(d.black).toBe('#0F1729')
  })
})

describe('Themes.deriveCustomColors (light)', () => {
  const l = deriveCustomColors({
    colorMode: 'light',
    accent: '#0A5FE0',
    background: '#F4EFE6',
    card: '#EBE4D5',
    text: '#1A1712'
  })

  test('emits light coolGray300-600 tokens', () => {
    for (let k of ['coolGray300', 'coolGray400', 'coolGray500', 'coolGray600']) {
      expect(l[k]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('emits muted Badge pill tokens (backgroundLightMuted + secondary*)', () => {
    expect(l.backgroundLightMuted).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(l.secondary300).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(l.secondary600).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  test('text Light ramp and surfaces map to picks', () => {
    expect(l.textLight700).toBe('#1A1712')
    expect(l.backgroundContentLight).toBe('#F4EFE6')
    expect(l.backgroundCardLight).toBe('#EBE4D5')
    expect(l.muted800).toBe('#1A1712')
  })
})

describe('Themes.previewColorsFor', () => {
  test('null record returns light fallback', () => {
    let p = previewColorsFor(null)
    expect(p.page).toBe('#f5f5f5')
    expect(p.accent).toBe('#64748b')
  })

  test('tangerine resolves to its dark surfaces + accent', () => {
    let p = previewColorsFor(themes.tangerine)
    expect(p.page).toBe('#F97316')
    expect(p.card).toBe('#EF4444')
    expect(p.accent).toBe('#FFB347')
    expect(p.text).toBe('#FFFFFF')
  })

  test('editorial resolves to its light surfaces + accent', () => {
    let p = previewColorsFor(themes.editorial)
    expect(p.page).toBe('#F4EFE6')
    expect(p.card).toBe('#EBE4D5')
    expect(p.accent).toBe('#B85E48')
  })

  test('default (no overrides) falls back to dark fallback palette', () => {
    let p = previewColorsFor({
      name: 'Default',
      colorMode: 'dark',
      swatch: { bg: '#1f2937', accent: '#64748b' },
      colors: {}
    })
    expect(p.page).toBe('#0f172a')
    expect(p.accent).toBe('#64748b')
  })
})

describe('Themes.customThemeCss', () => {
  test('empty / missing theme returns empty string', () => {
    expect(customThemeCss(null)).toBe('')
    expect(customThemeCss(undefined)).toBe('')
    expect(customThemeCss({})).toBe('')
  })

  test('invalid id returns empty (no CSS injection)', () => {
    const t = buildCustomTheme({ colorMode: 'dark' })
    expect(customThemeCss(t, 'Bad Id!')).toBe('')
    expect(customThemeCss(t, 'UPPER')).toBe('')
    expect(customThemeCss(t, 'a'.repeat(73))).toBe('')
  })

  test('default id scoping and token output', () => {
    const t = buildCustomTheme({ colorMode: 'dark' })
    const css = customThemeCss(t)
    expect(css.startsWith('[data-theme-id="custom"] {')).toBe(true)
    expect(css).toContain('--colors-primary400:')
  })

  test('non-hex values are filtered out', () => {
    const t = {
      colors: {
        primary400: '#38BDF8',
        badValue: 'not a color',
        anotherBad: '#short'
      }
    }
    const css = customThemeCss(t, 'custom')
    expect(css).toContain('--colors-primary400:')
    expect(css).not.toContain('badValue')
    expect(css).not.toContain('anotherBad')
  })

  test('injectable key names are rejected', () => {
    const t = {
      colors: {
        'good400': '#38BDF8',
        'bad key with spaces': '#000000',
        '};x{': '#000000'
      }
    }
    const css = customThemeCss(t, 'custom')
    expect(css).toContain('--colors-good400:')
    expect(css).not.toContain('bad key')
    expect(css).not.toContain('};x{')
    // make sure it didn't break out of the selector
    expect(css.indexOf('{')).toBeLessThan(css.indexOf('--colors-good400'))
  })
})

describe('Themes.mergeCustomThemes', () => {
  test('returns the base config unchanged when no custom themes', () => {
    expect(mergeCustomThemes(baseConfig, {})).toBe(baseConfig)
    expect(mergeCustomThemes(baseConfig, null)).toBe(baseConfig)
    expect(mergeCustomThemes(baseConfig, undefined)).toBe(baseConfig)
  })

  test('registers a custom theme into config.themes', () => {
    const record = buildCustomTheme({ colorMode: 'dark' })
    const id = customIdForName('My Demo')
    const records = { [id]: { id, ...record } }
    const merged = mergeCustomThemes(baseConfig, records)
    expect(merged.themes[id]).toBeTruthy()
    expect(merged.themes[id].colors).toEqual(record.colors)
    expect(merged.themes).toMatchObject(baseConfig.themes)
  })

  test('does not mutate the base config', () => {
    const id = customIdForName('Temp')
    const records = { [id]: { id, ...buildCustomTheme({}) } }
    const before = { ...baseConfig.themes }
    mergeCustomThemes(baseConfig, records)
    expect(baseConfig.themes).toEqual(before)
  })

  test('rejects invalid theme ids', () => {
    const record = buildCustomTheme({})
    const records = {
      'BAD ID!': { id: 'BAD ID!', ...record },
      alsoBad: { id: 'alsoBad', ...record }
    }
    const merged = mergeCustomThemes(baseConfig, records)
    expect(merged.themes['BAD ID!']).toBeUndefined()
    expect(merged.themes.alsoBad).toBeUndefined()
  })

  test('skips records with no colors', () => {
    const merged = mergeCustomThemes(baseConfig, {
      'custom-empty': { id: 'custom-empty', name: 'Empty' }
    })
    expect(merged.themes['custom-empty']).toBeUndefined()
  })
})

describe('ThemePreview component', () => {
  test('renders the sample card with a direct spec', () => {
    render(
      <ThemePreview
        spec={{
          colorMode: 'dark',
          accent: '#38BDF8',
          background: '#0F1729',
          card: '#182136',
          text: '#E2E8F5'
        }}
      />
    )
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('Living room TV')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('wan')).toBeTruthy()
  })

  test('synthesizes the spec from a theme record', () => {
    render(<ThemePreview theme={themes.tangerine} />)
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('Living room TV')).toBeTruthy()
  })

  test('synthesizes from a light-mode theme record', () => {
    render(<ThemePreview theme={themes.editorial} />)
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('Living room TV')).toBeTruthy()
  })

  test('no spec / no theme falls back to a dark safe default', () => {
    render(<ThemePreview />)
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('Living room TV')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('wan')).toBeTruthy()
  })
})

describe('Themes sanity', () => {
  test('DEFAULT_THEME is "default"', () => {
    expect(DEFAULT_THEME).toBe('default')
  })

  test('CUSTOM_THEME_ID is "custom"', () => {
    expect(CUSTOM_THEME_ID).toBe('custom')
  })

  test('built-in tangerine keeps cream sidebar + muted Badge overrides', () => {
    const c = themes.tangerine.colors
    expect(c.coolGray300).toBe('#fee3d0')
    expect(c.coolGray400).toBe('#fdcead')
    expect(c.backgroundDarkMuted).toBe('#e06814')
    expect(c.secondary700).toBe('#a24b0e')
  })
})
