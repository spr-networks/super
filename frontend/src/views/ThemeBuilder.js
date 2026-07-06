import React, { useContext, useState } from 'react'

import { AppContext, AlertContext } from 'AppContext'
import { DEFAULT_CUSTOM, deriveCustomColors } from 'Themes'

import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Input,
  InputField,
  Pressable,
  ScrollView,
  Text,
  VStack
} from '@gluestack-ui/themed'

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

const PRESETS = [
  '#38BDF8',
  '#1668B0',
  '#0A5FE0',
  '#22C55E',
  '#A8FF60',
  '#FFB347',
  '#F97316',
  '#EF4444',
  '#E579A8',
  '#A855F7',
  '#0F1729',
  '#020400',
  '#07101C',
  '#F4EFE6',
  '#FFFFFF',
  '#E2E8F5'
]

const ColorField = ({ label, help, value, onChange }) => {
  return (
    <VStack space="xs">
      <Text bold size="sm">
        {label}
      </Text>
      {help ? (
        <Text size="xs" color="$muted500">
          {help}
        </Text>
      ) : null}
      <HStack space="sm" alignItems="center">
        <Box
          w={36}
          h={36}
          rounded="$md"
          bg={HEX.test(value) ? value : '$muted200'}
          borderWidth={1}
          borderColor="$borderColorCardLight"
          sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
        />
        <Input size="sm" w={130}>
          <InputField
            autoCapitalize="none"
            autoCorrect={false}
            value={value}
            onChangeText={onChange}
            placeholder="#RRGGBB"
          />
        </Input>
      </HStack>
      <HStack space="xs" flexWrap="wrap">
        {PRESETS.map((c) => (
          <Pressable key={c} onPress={() => onChange(c)}>
            <Box
              w={18}
              h={18}
              rounded="$sm"
              bg={c}
              borderWidth={value?.toLowerCase() == c.toLowerCase() ? 2 : 1}
              borderColor={
                value?.toLowerCase() == c.toLowerCase()
                  ? '$primary500'
                  : '$muted300'
              }
            />
          </Pressable>
        ))}
      </HStack>
    </VStack>
  )
}

const Preview = ({ spec }) => {
  let c = deriveCustomColors(spec)
  let get = (k, fb) => c[k] || fb
  let dark = spec.colorMode == 'dark'
  let border = dark
    ? get('borderColorCardDark')
    : get('borderColorCardLight')
  let secondary = get('muted500')

  return (
    <Box
      rounded="$lg"
      p="$4"
      bg={spec.background}
      borderWidth={1}
      borderColor={border}
    >
      <Text bold mb="$3" style={{ color: spec.text }}>
        Preview
      </Text>
      <Box
        rounded="$md"
        p="$3"
        bg={spec.card}
        borderWidth={1}
        borderColor={border}
      >
        <Text bold style={{ color: spec.text }}>
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
            <Text size="xs" style={{ color: spec.card }}>
              wan
            </Text>
          </Box>
        </HStack>
      </Box>
    </Box>
  )
}

export default function ThemeBuilder() {
  const appContext = useContext(AppContext)
  const alertContext = useContext(AlertContext)

  const [spec, setSpec] = useState(
    (appContext.customTheme && appContext.customTheme.spec) || DEFAULT_CUSTOM
  )

  const update = (key) => (value) => setSpec({ ...spec, [key]: value })

  const valid =
    HEX.test(spec.accent) &&
    HEX.test(spec.background) &&
    HEX.test(spec.card) &&
    HEX.test(spec.text)

  const onSave = () => {
    if (!valid) {
      alertContext.error('Enter valid #RRGGBB colors for all four fields')
      return
    }
    appContext.saveCustomTheme(spec)
    alertContext.success('Custom theme applied')
  }

  return (
    <ScrollView>
      <VStack space="lg" p="$4" maxWidth={720}>
        <VStack space="xs">
          <Heading size="md">Custom theme</Heading>
          <Text color="$muted500">
            Pick four colors and a base mode. The accent ramp, borders and
            secondary text are derived automatically. Saving applies it live and
            adds a “Custom” entry to the theme menu.
          </Text>
        </VStack>

        <VStack space="xs">
          <Text bold size="sm">
            Base
          </Text>
          <HStack space="sm">
            {['light', 'dark'].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={spec.colorMode == m ? 'solid' : 'outline'}
                action={spec.colorMode == m ? 'primary' : 'secondary'}
                onPress={() => setSpec({ ...spec, colorMode: m })}
              >
                <ButtonText>{m == 'light' ? 'Light' : 'Dark'}</ButtonText>
              </Button>
            ))}
          </HStack>
        </VStack>

        <HStack space="2xl" flexWrap="wrap">
          <VStack space="lg" flex={1} minWidth={280}>
            <ColorField
              label="Accent"
              help="Buttons, links, active items"
              value={spec.accent}
              onChange={update('accent')}
            />
            <ColorField
              label="Background"
              help="App canvas behind cards"
              value={spec.background}
              onChange={update('background')}
            />
            <ColorField
              label="Card surface"
              help="Panels, list rows, navbar"
              value={spec.card}
              onChange={update('card')}
            />
            <ColorField
              label="Text"
              help="Primary text and headings"
              value={spec.text}
              onChange={update('text')}
            />
          </VStack>

          <VStack space="md" flex={1} minWidth={280}>
            <Preview spec={spec} />
          </VStack>
        </HStack>

        <HStack space="sm">
          <Button action="primary" onPress={onSave} isDisabled={!valid}>
            <ButtonText>Apply &amp; Save</ButtonText>
          </Button>
          <Button
            variant="outline"
            action="secondary"
            onPress={() => setSpec(DEFAULT_CUSTOM)}
          >
            <ButtonText>Reset</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </ScrollView>
  )
}
