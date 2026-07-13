import React, { useContext, useState } from 'react'
import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Checkbox,
  CheckboxGroup,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CloseIcon,
  Heading,
  HStack,
  Icon,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { BellOffIcon } from 'lucide-react-native'
import { useNavigate } from 'react-router-dom'

import { alertsAPI, deviceAPI } from 'api'
import { AlertContext } from 'AppContext'
import { isAlertResolved } from 'components/Alerts/AlertStateUtil'
import {
  alertIgnoreRuleError,
  appendAlertIgnoreCondition,
  buildAlertIgnoreCondition,
  findAlertRule,
  getAlertIgnoreCandidates,
  getDefaultAlertIgnoreFields
} from 'components/Alerts/AlertIgnoreUtil'

const monoFont =
  Platform.OS === 'web'
    ? { fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace' }
    : {}

const AlertIgnoreResolution = ({ item, onResolved }) => {
  const context = useContext(AlertContext)
  const navigate = useNavigate()
  const candidates = getAlertIgnoreCandidates(item)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ruleMatch, setRuleMatch] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selectedPaths, setSelectedPaths] = useState(
    getDefaultAlertIgnoreFields(candidates)
  )
  const [deviceNames, setDeviceNames] = useState({})

  if (isAlertResolved(item) || !candidates.length) return null

  const open = async () => {
    setIsOpen(true)
    setLoading(true)
    setLoadError('')
    setSelectedPaths(getDefaultAlertIgnoreFields(candidates))

    deviceAPI
      .list()
      .then((devices) => {
        const names = {}
        Object.values(devices || {}).forEach((device) => {
          if (!device?.Name) return
          if (device.MAC) names[device.MAC.toLowerCase()] = device.Name
          if (device.RecentIP) names[device.RecentIP] = device.Name
        })
        setDeviceNames(names)
      })
      .catch(() => {})

    try {
      const rules = (await alertsAPI.list()) || []
      const match = findAlertRule(rules, item)
      setRuleMatch(match)
      if (!match) setLoadError('The alert rule could not be found.')
    } catch (err) {
      setLoadError('Could not load the alert rule.')
    } finally {
      setLoading(false)
    }
  }

  const deviceNameFor = (value) =>
    deviceNames[String(value).toLowerCase()] || deviceNames[String(value)]

  const macCandidate = candidates.find((entry) => /mac/i.test(entry.label))

  const scope = !selectedPaths.length
    ? null
    : selectedPaths.length === candidates.length
      ? { label: 'Narrow', action: 'success', hint: 'only identical events' }
      : selectedPaths.length === 1
        ? { label: 'Broad', action: 'warning', hint: 'any event sharing this value' }
        : { label: 'Moderate', action: 'info', hint: 'must match all selected values' }

  const ruleError = loadError || alertIgnoreRuleError(ruleMatch?.rule)
  const condition = buildAlertIgnoreCondition(item, selectedPaths)
  const ruleName =
    ruleMatch?.rule?.Name || item.Title || item.Topic || 'Alert rule'

  const apply = async () => {
    if (busy || ruleError || !condition || !ruleMatch) return
    setBusy(true)
    try {
      const updated = appendAlertIgnoreCondition(ruleMatch.rule, condition)
      if (updated.added) {
        await alertsAPI.update(ruleMatch.index, updated.rule)
      }
      const didResolve = await onResolved()
      if (didResolve === false) return
      setIsOpen(false)
      context.success(
        updated.added
          ? 'Ignore exception added and alert resolved'
          : 'Ignore exception already exists; alert resolved'
      )
    } catch (err) {
      context.error('Failed to add ignore exception', err?.message || err)
    } finally {
      setBusy(false)
    }
  }

  const hairline = {
    borderColor: '$borderColorCardLight'
  }

  return (
    <>
      <Button size="xs" action="secondary" variant="outline" onPress={open}>
        <ButtonIcon as={BellOffIcon} mr="$2" />
        <ButtonText>Ignore similar</ButtonText>
      </Button>

      {isOpen ? (
        <Modal
          isOpen={true}
          onClose={() => setIsOpen(false)}
          useRNModal={Platform.OS === 'web'}
        >
          <ModalBackdrop />
          <ModalContent maxWidth={640} maxHeight="85%" w="92%">
            <ModalHeader
              px="$4"
              pt="$3"
              pb="$3"
              borderBottomWidth={1}
              {...hairline}
              sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
            >
              <VStack flex={1} space="xs" pr="$8">
                <Text
                  size="2xs"
                  fontWeight="$semibold"
                  letterSpacing="$xl"
                  color="$textLight500"
                  sx={{ _dark: { color: '$textDark400' } }}
                >
                  IGNORE MATCHING ALERTS
                </Text>
                <Heading size="md" fontWeight="$bold">
                  {ruleName}
                </Heading>
                <Text
                  size="xs"
                  color="$textLight500"
                  sx={{ _dark: { color: '$textDark300' } }}
                >
                  Future events matching all selected values are ignored — fewer
                  fields ignore more.
                </Text>
              </VStack>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>

            <ModalBody
              px="$4"
              py="$3"
              flexGrow={0}
              contentContainerStyle={{ alignItems: 'stretch', flexGrow: 0 }}
            >
              {loading ? (
                <VStack py="$6" alignItems="center" space="xs">
                  <Spinner />
                  <Text size="sm">Loading alert rule…</Text>
                </VStack>
              ) : (
                <VStack space="md" w="$full">
                  <HStack space="sm" flexWrap="wrap" alignItems="center">
                    {macCandidate ? (
                      <Button
                        size="xs"
                        action="secondary"
                        variant="outline"
                        borderRadius="$full"
                        onPress={() => setSelectedPaths([macCandidate.path])}
                      >
                        <ButtonText>
                          {deviceNameFor(macCandidate.value)
                            ? `Anything from ${deviceNameFor(macCandidate.value)}`
                            : 'Anything from this device'}
                        </ButtonText>
                      </Button>
                    ) : null}
                    <Button
                      size="xs"
                      action="secondary"
                      variant="outline"
                      borderRadius="$full"
                      onPress={() =>
                        setSelectedPaths(candidates.map((entry) => entry.path))
                      }
                    >
                      <ButtonText>Only identical events</ButtonText>
                    </Button>
                  </HStack>

                  <CheckboxGroup
                    value={selectedPaths}
                    onChange={setSelectedPaths}
                    accessibilityLabel="Ignore condition fields"
                  >
                    <VStack
                      borderWidth={1}
                      borderRadius="$lg"
                      overflow="hidden"
                      {...hairline}
                      sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
                    >
                      {candidates.map((candidate, index) => {
                        const selected = selectedPaths.includes(candidate.path)
                        const deviceName = deviceNameFor(candidate.value)
                        return (
                          <Checkbox
                            key={candidate.path}
                            value={candidate.path}
                            colorScheme="primary"
                            w="$full"
                            px="$3"
                            py="$2"
                            borderBottomWidth={
                              index < candidates.length - 1 ? 1 : 0
                            }
                            {...hairline}
                            bg={selected ? '$primary50' : '$transparent'}
                            sx={{
                              ':hover': { bg: '$backgroundMutedLight' },
                              _dark: {
                                borderColor: '$borderColorCardDark',
                                bg: selected ? '$primary900' : '$transparent',
                                ':hover': { bg: '$backgroundMutedDark' }
                              }
                            }}
                          >
                            <CheckboxIndicator mr="$3">
                              <CheckboxIcon />
                            </CheckboxIndicator>
                            <CheckboxLabel flex={1}>
                              <HStack
                                flex={1}
                                alignItems="center"
                                space="md"
                                flexWrap="wrap"
                              >
                                <Text
                                  size="xs"
                                  fontWeight="$medium"
                                  w={150}
                                  color="$textLight500"
                                  sx={{ _dark: { color: '$textDark300' } }}
                                >
                                  {candidate.label}
                                </Text>
                                <Text size="xs" flex={1} style={monoFont}>
                                  {String(candidate.value)}
                                </Text>
                                {deviceName ? (
                                  <Badge
                                    size="sm"
                                    action="muted"
                                    variant="outline"
                                  >
                                    <BadgeText textTransform="none">
                                      {deviceName}
                                    </BadgeText>
                                  </Badge>
                                ) : null}
                              </HStack>
                            </CheckboxLabel>
                          </Checkbox>
                        )
                      })}
                    </VStack>
                  </CheckboxGroup>

                  <VStack
                    borderWidth={1}
                    borderRadius="$lg"
                    overflow="hidden"
                    {...hairline}
                    sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
                  >
                    <HStack
                      px="$3"
                      py="$2"
                      alignItems="center"
                      justifyContent="space-between"
                      bg="$backgroundMutedLight"
                      sx={{ _dark: { bg: '$backgroundMutedDark' } }}
                    >
                      <Text
                        size="2xs"
                        fontWeight="$semibold"
                        letterSpacing="$xl"
                        color="$textLight500"
                        sx={{ _dark: { color: '$textDark400' } }}
                      >
                        IGNORE WHEN
                      </Text>
                      {scope ? (
                        <Badge size="sm" action={scope.action} variant="solid">
                          <BadgeText textTransform="none">
                            {scope.label} — {scope.hint}
                          </BadgeText>
                        </Badge>
                      ) : null}
                    </HStack>
                    <VStack px="$3" py="$2.5" space="xs">
                      {selectedPaths.length ? (
                        selectedPaths.map((path, index) => {
                          const candidate = candidates.find(
                            (entry) => entry.path === path
                          )
                          const deviceName = deviceNameFor(candidate?.value)
                          return (
                            <Text key={path} size="xs" style={monoFont}>
                              {index > 0 ? 'AND ' : ''}
                              {candidate?.label} = {String(candidate?.value)}
                              {deviceName ? `  (${deviceName})` : ''}
                            </Text>
                          )
                        })
                      ) : (
                        <Text
                          size="xs"
                          color="$textLight500"
                          sx={{ _dark: { color: '$textDark300' } }}
                        >
                          Select at least one field.
                        </Text>
                      )}
                    </VStack>
                  </VStack>

                  {ruleError ? (
                    <VStack
                      px="$3"
                      py="$2.5"
                      borderRadius="$md"
                      bg="$error50"
                      sx={{ _dark: { bg: '$error950' } }}
                      space="xs"
                    >
                      <Text size="sm" color="$error700">
                        {ruleError}
                      </Text>
                      {ruleMatch ? (
                        <Button
                          size="xs"
                          action="secondary"
                          variant="outline"
                          alignSelf="flex-start"
                          onPress={() => {
                            setIsOpen(false)
                            navigate(`/admin/alerts/${ruleMatch.index}`)
                          }}
                        >
                          <ButtonText>Open rule editor</ButtonText>
                        </Button>
                      ) : null}
                    </VStack>
                  ) : null}
                </VStack>
              )}
            </ModalBody>

            {!loading ? (
              <ModalFooter
                px="$4"
                py="$3"
                borderTopWidth={1}
                {...hairline}
                sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
              >
                <HStack w="$full" space="sm" justifyContent="flex-end">
                  <Button
                    size="sm"
                    action="secondary"
                    variant="outline"
                    onPress={() => setIsOpen(false)}
                  >
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button
                    size="sm"
                    onPress={apply}
                    isDisabled={busy || Boolean(ruleError) || !condition}
                  >
                    {busy ? (
                      <Spinner color="white" />
                    ) : (
                      <ButtonText>Add exception & resolve</ButtonText>
                    )}
                  </Button>
                </HStack>
              </ModalFooter>
            ) : null}
          </ModalContent>
        </Modal>
      ) : null}
    </>
  )
}

export default AlertIgnoreResolution
