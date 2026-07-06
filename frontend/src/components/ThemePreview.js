import React from 'react'
import { Box, HStack, Text } from '@gluestack-ui/themed'
import { deriveCustomColors, previewColorsFor } from 'Themes'

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

  let d = deriveCustomColors(s)
  let get = (k, fb) => d[k] || fb
  let dark = s.colorMode == 'dark'
  let border = dark ? get('borderColorCardDark') : get('borderColorCardLight')
  let secondary = get('muted500')

  return (
    <Box
      rounded="$lg"
      p="$4"
      bg={s.background}
      borderWidth={1}
      borderColor={border}
      {...props}
    >
      <Text bold mb="$3" style={{ color: s.text }}>
        Preview
      </Text>
      <Box
        rounded="$md"
        p="$3"
        bg={s.card}
        borderWidth={1}
        borderColor={border}
      >
        <Text bold style={{ color: s.text }}>
          Living room TV
        </Text>
        <Text size="sm" style={{ color: secondary }}>
          192.168.2.24 · online
        </Text>
        <HStack space="sm" mt="$2" alignItems="center">
          <Box rounded="$md" px="$3" py="$1" bg={get('primary600')}>
            <Text size="sm" style={{ color: '#ffffff' }}>
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
