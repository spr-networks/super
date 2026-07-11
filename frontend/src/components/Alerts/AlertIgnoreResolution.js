import React, { useContext, useState } from 'react'
import { Platform } from 'react-native'

import {
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
  ModalHeader,
  Spinner,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { BellOffIcon } from 'lucide-react-native'
import { useNavigate } from 'react-router-dom'

import { alertsAPI } from 'api'
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

  if (isAlertResolved(item) || !candidates.length) return null

  const open = async () => {
    setIsOpen(true)
    setLoading(true)
    setLoadError('')
    setSelectedPaths(getDefaultAlertIgnoreFields(candidates))
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

  const ruleError = loadError || alertIgnoreRuleError(ruleMatch?.rule)
  const condition = buildAlertIgnoreCondition(item, selectedPaths)

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
          <ModalContent maxWidth={600} maxHeight="90%">
            <ModalHeader>
              <Heading size="sm">Ignore matching alerts</Heading>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody pb="$6">
              {loading ? (
                <VStack py="$10" alignItems="center" space="sm">
                  <Spinner />
                  <Text size="sm">Loading alert rule…</Text>
                </VStack>
              ) : (
                <VStack space="lg">
                  <VStack space="xs">
                    <Text size="sm">
                      Add an exception to{' '}
                      <Text fontWeight="$semibold">
                        {ruleMatch?.rule?.Name || 'this alert rule'}
                      </Text>
                      . Future events matching every selected value will be
                      ignored.
                    </Text>
                    <Text
                      size="xs"
                      color="$textLight500"
                      sx={{ _dark: { color: '$textDark300' } }}
                    >
                      Choose the narrowest useful identity. Select more fields
                      to make the exception more specific.
                    </Text>
                  </VStack>

                  <CheckboxGroup
                    value={selectedPaths}
                    onChange={setSelectedPaths}
                    accessibilityLabel="Ignore condition fields"
                  >
                    <VStack space="sm">
                      {candidates.map((candidate) => (
                        <Checkbox
                          key={candidate.path}
                          value={candidate.path}
                          colorScheme="primary"
                          p="$3"
                          borderWidth={1}
                          borderRadius="$md"
                          borderColor="$borderColorCardLight"
                          sx={{
                            _dark: { borderColor: '$borderColorCardDark' }
                          }}
                        >
                          <CheckboxIndicator mr="$3">
                            <CheckboxIcon />
                          </CheckboxIndicator>
                          <CheckboxLabel flex={1}>
                            <VStack flex={1} space="xs">
                              <Text size="sm" fontWeight="$medium">
                                {candidate.label}
                              </Text>
                              <Text
                                size="xs"
                                color="$textLight500"
                                sx={{ _dark: { color: '$textDark300' } }}
                              >
                                {candidate.path} = {String(candidate.value)}
                              </Text>
                            </VStack>
                          </CheckboxLabel>
                        </Checkbox>
                      ))}
                    </VStack>
                  </CheckboxGroup>

                  {ruleError ? (
                    <VStack
                      p="$3"
                      borderRadius="$md"
                      bg="$error50"
                      sx={{ _dark: { bg: '$error950' } }}
                      space="sm"
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
                  ) : (
                    <VStack
                      p="$3"
                      borderRadius="$md"
                      bg="$backgroundMutedLight"
                      sx={{ _dark: { bg: '$backgroundMutedDark' } }}
                      space="xs"
                    >
                      <Text size="xs" fontWeight="$semibold">
                        EXCEPTION PREVIEW
                      </Text>
                      <Text size="xs">
                        {selectedPaths.length
                          ? selectedPaths
                              .map((path) => {
                                const candidate = candidates.find(
                                  (entry) => entry.path === path
                                )
                                return `${candidate?.label}: ${candidate?.value}`
                              })
                              .join(' AND ')
                          : 'Select at least one field.'}
                      </Text>
                    </VStack>
                  )}

                  <HStack space="sm" justifyContent="flex-end" flexWrap="wrap">
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
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  )
}

export default AlertIgnoreResolution
