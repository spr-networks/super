import React, { useEffect } from 'react'
import { Box, HStack, Text } from '@gluestack-ui/themed'
import {
  deriveCustomColors,
  previewColorsFor,
  themeFonts,
  themeFontFacesCss,
  isValidThemeFont
} from 'Themes'

// Single shared theme preview: a sample card (title, device row, Save button
// + tag) painted from a {background, card, text, accent} spec, run through
// deriveCustomColors for borders/secondary. Identical to the ThemeBuilder
// preview so the Setup picker matches the customizer exactly.
//
// Pass `spec` directly (builder), or `theme` (a theme record) and the
// representative 4-color spec is synthesized from its resolved token colors.
const ThemePreview = ({ spec, theme, ...props }) => {
  let s = spec
  if (!s && theme) {
    let c = previewColorsFor(theme)
    s = {
      colorMode: theme.colorMode === 'light' ? 'light' : 'dark',
      accent: c.accent,
      background: c.page,
      card: c.card,
      text: c.text
    }
  }
  if (!s) {
    s = {
      colorMode: 'dark',
      accent: '#64748b',
      background: '#0f172a',
      card: '#1e293b',
      text: '#f8fafc'
    }
  }

  let d = deriveCustomColors(s)
  let get = (k, fb) => d[k] || fb
  let dark = s.colorMode == 'dark'
  let border = dark ? get('borderColorCardDark') : get('borderColorCardLight')
  let secondary = get('muted500')

  let fontId = spec?.font || theme?.font
  let font = isValidThemeFont(fontId) ? themeFonts[fontId] : null
  let bodyFont = font?.body ? { fontFamily: font.body } : {}
  let headingFont = font?.heading
    ? {
        fontFamily: font.heading,
        ...(font.headingTransform ? { textTransform: font.headingTransform } : {}),
        ...(font.headingSpacing ? { letterSpacing: font.headingSpacing } : {})
      }
    : {}

  useEffect(() => {
    if (typeof document === 'undefined') return
    const css = themeFontFacesCss(fontId)
    if (!css) return
    const id = 'spr-font-preview'
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('style')
      el.id = id
      document.head.appendChild(el)
    }
    if (!el.textContent.includes(css)) {
      el.textContent += '\n' + css
    }
  }, [fontId])

  return (
    <Box
      rounded="$lg"
      p="$4"
      bg={s.background}
      borderWidth={1}
      borderColor={border}
      {...props}
    >
      <Text bold mb="$3" style={{ color: s.text, ...headingFont }}>
        Preview
      </Text>
      <Box
        rounded="$md"
        p="$3"
        bg={s.card}
        borderWidth={1}
        borderColor={border}
      >
        <Text bold style={{ color: s.text, ...headingFont }}>
          Living room TV
        </Text>
        <Text size="sm" style={{ color: secondary, ...bodyFont }}>
          192.168.2.24 · online
        </Text>
        <HStack space="sm" mt="$2" alignItems="center">
          <Box rounded="$md" px="$3" py="$1" bg={get('primary600')}>
            <Text size="sm" style={{ color: '#ffffff', ...bodyFont }}>
              Save
            </Text>
          </Box>
          <Box rounded="$lg" px="$2" py="$1" bg={get('primary400')}>
            <Text size="xs" style={{ color: s.card }}>
              wan
            </Text>
          </Box>
        </HStack>
      </Box>
    </Box>
  )
}

export default ThemePreview
