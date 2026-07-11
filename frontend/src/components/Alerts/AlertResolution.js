import React, { useContext, useState } from 'react'

import {
  Button,
  ButtonText,
  CloseIcon,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  HStack,
  Icon,
  Input,
  InputField,
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

import { Platform } from 'react-native'
import { deviceAPI } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import AddEndpoint from 'components/Firewall/AddEndpoint'
import { isAlertResolved } from 'components/Alerts/AlertStateUtil'

const AlertResolution = ({ item, resolution, onResolved }) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const [modalType, setModalType] = useState(null)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  if (!resolution || isAlertResolved(item)) return null

  const identity = resolution.device.MAC || resolution.device.WGPubKey

  const refreshDevice = async () => {
    if (appContext.getDevices) {
      try {
        await appContext.getDevices(true)
      } catch (err) {}
    }
  }

  const finish = async (message) => {
    await refreshDevice()
    const didResolve = await onResolved()
    if (didResolve === false) return
    setModalType(null)
    context.success(message)
  }

  const applyPrimary = async () => {
    if (busy) return

    if (resolution.kind === 'update-wifi-password') {
      if (password.length < 8 || password.length > 63) {
        setPasswordError('Use 8–63 characters.')
        return
      }
    }

    setBusy(true)
    try {
      if (resolution.kind === 'assign-vlan') {
        await deviceAPI.updateVLANTag(identity, resolution.vlan)
        await finish(`VLAN ${resolution.vlan} assigned and alert resolved`)
      } else if (resolution.kind === 'apply-upstream-policy') {
        const policies = [
          ...new Set([...(resolution.device.Policies || []), 'lan_upstream'])
        ]
        await deviceAPI.updatePolicies(identity, policies)
        await finish('Upstream Private Networks policy applied')
      } else if (resolution.kind === 'update-wifi-password') {
        await deviceAPI.update(identity, {
          PSKEntry: {
            Psk: password,
            Type: resolution.device.PSKEntry.Type
          }
        })
        await finish('Wi-Fi password updated and alert resolved')
      }
    } catch (err) {
      context.error('Resolution failed', err?.message || err)
    } finally {
      setBusy(false)
    }
  }

  const confirmationCopy = {
    'assign-vlan': `Assign VLAN ${resolution.vlan} to ${resolution.device.Name || identity}. This updates the device configuration immediately.`,
    'apply-upstream-policy': `Add the Upstream Private Networks policy to ${resolution.device.Name || identity}. This grants the device access to private networks upstream of SPR.`
  }

  const modalTitle =
    modalType === 'firewall' ? 'Create specific firewall rule' : resolution.title

  return (
    <>
      <VStack
        px="$4"
        py="$3"
        space="sm"
        borderTopWidth={1}
        borderColor="$borderColorCardLight"
        bg="$primary50"
        sx={{
          _dark: {
            bg: '$primary900',
            borderColor: '$borderColorCardDark'
          }
        }}
      >
        <Text
          size="xs"
          fontWeight="$bold"
          color="$primary700"
          sx={{ _dark: { color: '$primary200' } }}
        >
          RECOMMENDED RESOLUTION
        </Text>
        <VStack space="xs">
          <Text size="sm" fontWeight="$semibold">
            {resolution.title}
          </Text>
          <Text
            size="xs"
            color="$textLight500"
            sx={{ _dark: { color: '$textDark300' } }}
          >
            {resolution.description}
          </Text>
        </VStack>
        <HStack space="sm" flexWrap="wrap">
          <Button size="xs" action="primary" onPress={() => setModalType('primary')}>
            <ButtonText>{resolution.actionLabel}</ButtonText>
          </Button>
          {resolution.firewallDraft ? (
            <Button
              size="xs"
              action="secondary"
              variant="outline"
              onPress={() => setModalType('firewall')}
            >
              <ButtonText>Create firewall rule</ButtonText>
            </Button>
          ) : null}
        </HStack>
      </VStack>

      {modalType !== null ? (
        <Modal
          isOpen={true}
          onClose={() => setModalType(null)}
          useRNModal={Platform.OS === 'web'}
        >
          <ModalBackdrop />
          <ModalContent maxWidth={560} maxHeight="90%">
            <ModalHeader>
              <Heading size="sm">{modalTitle}</Heading>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody pb="$6">
              {modalType === 'firewall' ? (
                <VStack space="md">
                  <Text
                    size="sm"
                    color="$textLight500"
                    sx={{ _dark: { color: '$textDark300' } }}
                  >
                    Review this narrow destination rule before saving. The
                    source device will receive the matching access tag.
                  </Text>
                  <AddEndpoint
                    draft={resolution.firewallDraft}
                    initialDeviceIds={resolution.firewallDraft.initialDeviceIds}
                    notifyChange={() =>
                      finish('Firewall rule created and alert resolved')
                    }
                  />
                </VStack>
              ) : resolution.kind === 'update-wifi-password' ? (
                <VStack space="md">
                  <Text size="sm">
                    Set a new per-device password for{' '}
                    {resolution.device.Name || identity}.
                  </Text>
                  <FormControl isInvalid={Boolean(passwordError)} isRequired>
                    <FormControlLabel>
                      <FormControlLabelText>
                        New Wi-Fi password
                      </FormControlLabelText>
                    </FormControlLabel>
                    <Input>
                      <InputField
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChangeText={(value) => {
                          setPassword(value)
                          setPasswordError('')
                        }}
                      />
                    </Input>
                    <FormControlHelper>
                      <FormControlHelperText>
                        {passwordError || 'Use 8–63 characters.'}
                      </FormControlHelperText>
                    </FormControlHelper>
                  </FormControl>
                  <Button onPress={applyPrimary} isDisabled={busy}>
                    {busy ? (
                      <Spinner color="white" />
                    ) : (
                      <ButtonText>Update password</ButtonText>
                    )}
                  </Button>
                </VStack>
              ) : (
                <VStack space="md">
                  <Text size="sm">{confirmationCopy[resolution.kind]}</Text>
                  <Button onPress={applyPrimary} isDisabled={busy}>
                    {busy ? (
                      <Spinner color="white" />
                    ) : (
                      <ButtonText>{resolution.actionLabel}</ButtonText>
                    )}
                  </Button>
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
    </>
  )
}

export default AlertResolution
