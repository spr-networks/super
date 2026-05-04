import React, { useContext, useEffect, useState } from 'react'

import {
  Button,
  ButtonIcon,
  ButtonText,
  CheckIcon,
  HStack,
  Text,
  Textarea,
  TextareaInput,
  VStack
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { api } from 'api'
import { AlertContext } from 'AppContext'

const SSHKeys = () => {
  const context = useContext(AlertContext)
  const [keys, setKeys] = useState([])
  const [locked, setLocked] = useState(true)
  const [pending, setPending] = useState('')
  const [err, setErr] = useState(null)

  const refresh = () =>
    api
      .get('/authorizedKeys')
      .then((r) => {
        setKeys(r?.Keys || [])
        setLocked(!!r?.Locked)
        setErr(null)
      })
      .catch(() => setErr('Could not read authorized_keys'))

  useEffect(() => {
    refresh()
  }, [])

  const submit = () => {
    const lines = pending
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!lines.length) return
    api
      .put('/authorizedKeys', lines)
      .then(() => {
        setPending('')
        context.success('SSH key(s) added')
        refresh()
      })
      .catch(async (e) => {
        const msg = e?.response ? await e.response.text() : String(e)
        if (e?.response?.status === 409) {
          context.warning('authorized_keys already exists', 'edit it via SSH')
        } else {
          context.error('Failed to add key: ' + msg)
        }
      })
  }

  return (
    <>
      <ListHeader
        title="SSH Keys"
        description={
          locked
            ? 'authorized_keys is set; modify it directly via SSH.'
            : 'Add SSH public keys for the ubuntu user. Once written here, future edits must be done via SSH.'
        }
      />

      {keys.length ? (
        keys.map((k, i) => (
          <ListItem key={i}>
            <Text size="sm" fontFamily="$mono" flex={1} numberOfLines={1}>
              {k}
            </Text>
          </ListItem>
        ))
      ) : (
        <ListItem>
          <Text color="$muted500">No SSH keys configured</Text>
        </ListItem>
      )}

      {!locked ? (
        <VStack space="sm" p="$4">
          <Text size="sm" color="$muted500">
            Paste one or more SSH public keys, one per line:
          </Text>
          <Textarea size="sm">
            <TextareaInput
              placeholder="ssh-ed25519 AAAA..."
              value={pending}
              onChangeText={setPending}
            />
          </Textarea>
          <HStack justifyContent="flex-end">
            <Button action="primary" onPress={submit} isDisabled={!pending.trim()}>
              <ButtonText>Add</ButtonText>
              <ButtonIcon as={CheckIcon} ml="$1" />
            </Button>
          </HStack>
        </VStack>
      ) : null}

      {err ? (
        <Text color="$red500" p="$4">
          {err}
        </Text>
      ) : null}
    </>
  )
}

export default SSHKeys
