import React, { useContext, useEffect, useState } from 'react'

import {
  Box,
  Heading,
  HStack,
  ScrollView,
  Spinner,
  Switch,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'
import { featureFlagsAPI } from 'api'

export const AVAILABLE_FEATURE_FLAGS = [
  {
    name: 'rustap',
    label: 'RustAP',
    description: 'Rust-based userland access point daemon'
  },
  {
    name: 'webllm',
    label: 'WebLLM',
    description: 'Enable local webllm AI assistant'
  }
]

const knownFlags = (flags) =>
  AVAILABLE_FEATURE_FLAGS.map((flag) => flag.name).filter((flag) =>
    (flags || []).includes(flag)
  )

const FeatureFlags = () => {
  const context = useContext(AlertContext)
  const [enabledFlags, setEnabledFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingFlag, setSavingFlag] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    featureFlagsAPI
      .list()
      .then((flags) => {
        setEnabledFlags(knownFlags(flags))
        setLoadError('')
      })
      .catch((error) => {
        setLoadError('Failed to load feature flags')
        context.error?.('Failed to load feature flags', error)
      })
      .finally(() => setLoading(false))
  }, [context])

  const toggleFlag = (name, enabled) => {
    const previous = enabledFlags
    const next = knownFlags(
      enabled
        ? [...enabledFlags, name]
        : enabledFlags.filter((flag) => flag !== name)
    )

    setEnabledFlags(next)
    setSavingFlag(name)
    featureFlagsAPI
      .save(next)
      .then((saved) => {
        setEnabledFlags(knownFlags(saved))
        context.success?.('Feature flags updated')
      })
      .catch((error) => {
        setEnabledFlags(previous)
        context.error?.('Failed to update feature flags', error)
      })
      .finally(() => setSavingFlag(''))
  }

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="lg" p="$4" sx={{ '@md': { width: '$5/6' } }}>
        <VStack space="xs">
          <Heading size="md">Feature Flags</Heading>
          <Text color="$muted500">
            Enable experimental configuration flags.
          </Text>
        </VStack>

        {loading ? (
          <HStack space="sm" alignItems="center">
            <Spinner />
            <Text color="$muted500">Loading feature flags…</Text>
          </HStack>
        ) : null}

        {loadError ? <Text color="$error600">{loadError}</Text> : null}

        {!loading && !loadError ? (
          <VStack
            borderWidth="$1"
            borderColor="$borderLight200"
            rounded="$md"
            overflow="hidden"
            sx={{ _dark: { borderColor: '$borderDark700' } }}
          >
            {AVAILABLE_FEATURE_FLAGS.map((flag, index) => (
              <HStack
                key={flag.name}
                alignItems="center"
                justifyContent="space-between"
                space="lg"
                p="$4"
                borderBottomWidth={
                  index < AVAILABLE_FEATURE_FLAGS.length - 1 ? '$1' : '$0'
                }
                borderColor="$borderLight200"
                sx={{
                  _dark: {
                    borderColor: '$borderDark700'
                  }
                }}
              >
                <VStack flex={1} space="xs">
                  <HStack alignItems="center" space="sm">
                    <Text bold>{flag.label}</Text>
                    <Text size="xs" color="$muted500">
                      {flag.name}
                    </Text>
                  </HStack>
                  <Text size="sm" color="$muted500">
                    {flag.description}
                  </Text>
                </VStack>

                <Box>
                  <Switch
                    accessibilityLabel={`Enable ${flag.label}`}
                    value={enabledFlags.includes(flag.name)}
                    isDisabled={Boolean(savingFlag)}
                    onValueChange={(enabled) =>
                      toggleFlag(flag.name, enabled)
                    }
                  />
                </Box>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {savingFlag ? (
          <Text size="sm" color="$muted500">
            Saving {savingFlag}…
          </Text>
        ) : null}
      </VStack>
    </ScrollView>
  )
}

export default FeatureFlags
