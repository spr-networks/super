import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'

import {
  View,
  Text,
  Heading,
  HStack,
  Button,
  ButtonText,
  ButtonIcon,
  Input,
  InputField,
  FlatList,
  Icon,
  CloseIcon,
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter
} from '@gluestack-ui/themed'

import { deviceAPI } from 'api'
import { AlertContext } from 'AppContext'
import { ListHeader } from 'components/List'
import { Select } from 'components/Select'
import { Device } from 'components/Devices/Device'
import { TrashIcon } from 'lucide-react-native'

const deviceId = (d) => d.MAC || d.WGPubKey
const hasName = (d) => !!(d.Name && d.Name.length)

// matches BulkSettablePolicyStrings in api/code -- guestonly/api/disabled are
// system/guest managed and intentionally not settable here.
const POLICIES = [
  'wan',
  'lan',
  'dns',
  'dns:family',
  'lan_upstream',
  'noapi',
  'quarantine'
]

const DevicesBulkEdit = (props) => {
  const context = useContext(AlertContext)

  const [list, setList] = useState([])
  const [selected, setSelected] = useState({}) // deviceId -> true
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [groupVal, setGroupVal] = useState('')
  const [tagVal, setTagVal] = useState('')
  const [policyVal, setPolicyVal] = useState('')

  const refresh = () => {
    deviceAPI
      .list()
      .then((devices) => {
        if (!devices) {
          setList([])
          return
        }
        if (!Array.isArray(devices)) {
          devices = Object.values(devices)
        }
        setList(devices.filter((d) => deviceId(d)))
      })
      .catch((err) => context.error('API Failure', err))
  }

  useEffect(() => {
    refresh()
  }, [])

  const isSelected = (d) => selected[deviceId(d)] === true

  const toggle = (d) => {
    const id = deviceId(d)
    setSelected((s) => {
      const next = { ...s }
      if (next[id]) {
        delete next[id]
      } else {
        next[id] = true
      }
      return next
    })
  }

  // pre-select every device with no name assigned (shown as "N/A")
  const selectUnnamed = () => {
    let next = {}
    for (let d of list) {
      if (!hasName(d)) {
        next[deviceId(d)] = true
      }
    }
    setSelected(next)
  }

  const clearSelection = () => setSelected({})

  const selectedDevices = list.filter(isSelected)
  const selectedCount = selectedDevices.length
  const unnamedCount = list.filter((d) => !hasName(d)).length

  const doDelete = async () => {
    setDeleting(true)
    const ids = selectedDevices.map(deviceId)
    try {
      const res = await deviceAPI.deleteDevices(ids)
      const count = res && typeof res.count === 'number' ? res.count : ids.length
      context.success(`Deleted ${count} device${count === 1 ? '' : 's'}`)
      setSelected({})
    } catch (err) {
      context.error('[API] deleteDevices error: ' + (err?.message || err))
    }
    setDeleting(false)
    setShowConfirm(false)
    refresh()
  }

  // field: 'Groups' | 'Tags' | 'Policies'
  const applyAssign = async (field, value) => {
    const v = (value || '').trim()
    if (!v || selectedCount === 0) {
      return
    }
    const ids = selectedDevices.map(deviceId)
    try {
      const res = await deviceAPI.updateDevices({ Identities: ids, [field]: [v] })
      const count = res && typeof res.count === 'number' ? res.count : ids.length
      const label =
        field === 'Groups' ? 'group' : field === 'Tags' ? 'tag' : 'policy'
      context.success(
        `Added ${label} "${v}" to ${count} device${count === 1 ? '' : 's'}`
      )
      if (field === 'Groups') setGroupVal('')
      else if (field === 'Tags') setTagVal('')
      refresh()
    } catch (err) {
      context.error('[API] updateDevices error: ' + (err?.message || err))
    }
  }

  return (
    <View h="$full">
      <ListHeader
        title="Bulk Edit"
        info="Select devices, then delete them or assign a group, tag, or policy to all of them at once."
      >
        <HStack space="sm" alignItems="center" flexWrap="wrap">
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            onPress={selectUnnamed}
            isDisabled={unnamedCount === 0}
          >
            <ButtonText>Select unnamed ({unnamedCount})</ButtonText>
          </Button>

          <Button
            size="xs"
            action="secondary"
            variant="outline"
            onPress={clearSelection}
            isDisabled={selectedCount === 0}
          >
            <ButtonText>Clear</ButtonText>
          </Button>

          <Button
            size="xs"
            action="negative"
            variant="solid"
            onPress={() => setShowConfirm(true)}
            isDisabled={selectedCount === 0}
          >
            <ButtonIcon as={TrashIcon} mr="$1" />
            <ButtonText>Delete Selected ({selectedCount})</ButtonText>
          </Button>
        </HStack>
      </ListHeader>

      {selectedCount > 0 ? (
        <HStack
          space="sm"
          alignItems="center"
          flexWrap="wrap"
          px="$4"
          py="$2"
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
        >
          <Text size="sm" color="$muted500">
            Assign to {selectedCount} selected:
          </Text>

          <Input size="sm" variant="outline" w="$32">
            <InputField
              placeholder="group"
              value={groupVal}
              onChangeText={setGroupVal}
            />
          </Input>
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            isDisabled={!groupVal.trim()}
            onPress={() => applyAssign('Groups', groupVal)}
          >
            <ButtonText>Add group</ButtonText>
          </Button>

          <Input size="sm" variant="outline" w="$32">
            <InputField
              placeholder="tag"
              value={tagVal}
              onChangeText={setTagVal}
            />
          </Input>
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            isDisabled={!tagVal.trim()}
            onPress={() => applyAssign('Tags', tagVal)}
          >
            <ButtonText>Add tag</ButtonText>
          </Button>

          <Select
            selectedValue={policyVal}
            onValueChange={setPolicyVal}
            w="$36"
            size="sm"
            placeholder="policy"
          >
            {POLICIES.map((p) => (
              <Select.Item key={p} label={p} value={p} />
            ))}
          </Select>
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            isDisabled={!policyVal}
            onPress={() => applyAssign('Policies', policyVal)}
          >
            <ButtonText>Add policy</ButtonText>
          </Button>
        </HStack>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(item) => deviceId(item)}
        renderItem={({ item }) => (
          <Device
            device={item}
            showMenu={false}
            notifyChange={refresh}
            isSelected={isSelected(item)}
            onSelect={() => toggle(item)}
          />
        )}
      />

      {!list.length ? (
        <Text color="$muted500" p="$4">
          There are no devices configured yet
        </Text>
      ) : null}

      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        useRNModal={Platform.OS == 'web'}
      >
        <ModalBackdrop />
        <ModalContent>
          <ModalHeader>
            <Heading size="sm">
              Delete {selectedCount} device{selectedCount === 1 ? '' : 's'}?
            </Heading>
            <ModalCloseButton>
              <Icon as={CloseIcon} />
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody>
            <Text size="sm" color="$muted500">
              This permanently removes the selected devices and their
              configuration. This cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button
              action="secondary"
              variant="outline"
              mr="$3"
              onPress={() => setShowConfirm(false)}
              isDisabled={deleting}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button action="negative" onPress={doDelete} isDisabled={deleting}>
              <ButtonIcon as={TrashIcon} mr="$1" />
              <ButtonText>{deleting ? 'Deleting…' : 'Delete'}</ButtonText>
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </View>
  )
}

export default DevicesBulkEdit
