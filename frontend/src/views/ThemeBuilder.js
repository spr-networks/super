import React, { useContext, useState } from 'react'
import { Linking, Platform } from 'react-native'

import { AppContext, AlertContext } from 'AppContext'
import { DEFAULT_CUSTOM } from 'Themes'
import ThemePreview from 'components/ThemePreview'

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
  VStack,
  CloseIcon
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

export default function ThemeBuilder() {
  const appContext = useContext(AppContext)
  const alertContext = useContext(AlertContext)

  const [spec, setSpec] = useState(DEFAULT_CUSTOM)
  const [name, setName] = useState('Custom')

  const update = (key) => (value) => setSpec({ ...spec, [key]: value })

  const valid =
    name.trim().length > 0 &&
    HEX.test(spec.accent) &&
    HEX.test(spec.background) &&
    HEX.test(spec.card) &&
    HEX.test(spec.text)

  const onSave = () => {
    if (!valid) {
      alertContext.error('Enter a name and valid #RRGGBB colors for all fields')
      return
    }
    appContext.saveCustomTheme(name.trim(), spec)
    alertContext.success(`Custom theme "${name.trim()}" applied`)
  }

  const onShare = () => {
    if (!valid) return
    const trimmed = name.trim()
    const title = `Shared SPR theme: ${trimmed}`
    const body = [
      `My custom SPR theme, "${trimmed}".`,
      '',
      '```json',
      JSON.stringify(
        {
          name: trimmed,
          colorMode: spec.colorMode,
          accent: spec.accent,
          background: spec.background,
          card: spec.card,
          text: spec.text
        },
        null,
        2
      ),
      '```',
      '',
      '#489'
    ].join('\n')

    const url =
      'https://github.com/spr-networks/super/issues/new' +
      '?title=' +
      encodeURIComponent(title) +
      '&body=' +
      encodeURIComponent(body)

    if (Platform.OS == 'web' && typeof window != 'undefined') {
      window.open(url, '_blank')
    } else {
      Linking.openURL(url).catch(() =>
        alertContext.error('Could not open browser')
      )
    }
  }

  return (
    <ScrollView>
      <VStack space="lg" p="$4" maxWidth={720}>
        <VStack space="xs">
          <Heading size="md">Custom theme</Heading>
          <Text color="$muted500">
            Name your theme, pick four colors and a base mode. The accent ramp,
            borders and secondary text are derived automatically. Saving applies
            it live and adds an entry to the theme menu.
          </Text>
        </VStack>

        <VStack space="xs">
          <Text bold size="sm">
            Theme name
          </Text>
          <Input size="sm" w={280}>
            <InputField
              value={name}
              name="spr-theme-name"
              autoComplete="off"
              textContentType="none"
              placeholder="e.g. Sunset"
              onChangeText={setName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Input>
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
            <ThemePreview spec={spec} />
          </VStack>
        </HStack>

        <HStack space="sm">
          <Button action="primary" onPress={onSave} isDisabled={!valid}>
            <ButtonText>Apply &amp; Save</ButtonText>
          </Button>
          <Button
            variant="outline"
            action="secondary"
            onPress={() => {
              setSpec(DEFAULT_CUSTOM)
              setName('Custom')
            }}
          >
            <ButtonText>Reset</ButtonText>
          </Button>
          <Button
            variant="outline"
            action="secondary"
            onPress={onShare}
            isDisabled={!valid}
          >
            <ButtonText>Share my theme</ButtonText>
          </Button>
        </HStack>

        {Object.keys(appContext.customThemes || {}).length > 0 ? (
          <VStack space="sm">
            <Text bold size="sm">
              Saved themes
            </Text>
            <VStack space="xs">
              {Object.values(appContext.customThemes).map((t) => (
                <HStack
                  key={t.id || t.name}
                  alignItems="center"
                  justifyContent="space-between"
                  p="$2"
                  rounded="$md"
                  borderWidth={1}
                  borderColor="$muted200"
                  sx={{ _dark: { borderColor: '$muted700' } }}
                >
                  <HStack alignItems="center" space="sm">
                    <Box
                      w={8}
                      h={8}
                      rounded="$full"
                      bg={t.swatch?.bg || t.spec?.background}
                      borderWidth={1}
                      borderColor="$muted300"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Box
                        w={3}
                        h={3}
                        rounded="$full"
                        bg={t.swatch?.accent || t.spec?.accent}
                      />
                    </Box>
                    <Text size="sm">{t.name}</Text>
                    {appContext.theme === t.id ? (
                      <Text size="xs" color="$muted500">
                        active
                      </Text>
                    ) : null}
                  </HStack>
                  <Button
                    size="sm"
                    variant="link"
                    action="negative"
                    onPress={() => appContext.deleteCustomTheme(t.id)}
                  >
                    <ButtonText>Delete</ButtonText>
                  </Button>
                </HStack>
              ))}
            </VStack>
          </VStack>
        ) : null}
      </VStack>
    </ScrollView>
  )
}
