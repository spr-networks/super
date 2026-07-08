import React, { useContext, useEffect, useRef, useState } from 'react'
import { AlertContext } from 'AppContext'
import { deviceAPI, dbAPI } from 'api'

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  Badge,
  BadgeIcon,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  FlatList,
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
  Menu,
  MenuItem,
  MenuItemLabel,
  Pressable,
  Text,
  ThreeDotsIcon,
  TrashIcon,
  VStack
} from '@gluestack-ui/themed'

import { EditIcon, UserIcon } from 'lucide-react-native'

import ModalForm from 'components/ModalForm'
import ClientSelect from 'components/ClientSelect'
import { ListHeader, ListItem } from 'components/List'

const personaTag = (label) => `persona:${label}`

const normalizeLabel = (label) => label.trim().toLowerCase().replace(/\s+/g, '-')

const deviceId = (device) => device.MAC || device.WGPubKey

const selectableDevices = (devices) =>
  devices.filter((device) => deviceId(device) && device.MAC != 'pending')

const AddPersona = ({ item, devices, onSave }) => {
  const [label, setLabel] = useState(item?.Label || '')
  const [description, setDescription] = useState(item?.Description || '')
  const [selected, setSelected] = useState([])

  useEffect(() => {
    setLabel(item?.Label || '')
    setDescription(item?.Description || '')
    setSelected(
      item
        ? selectableDevices(devices)
            .filter((device) =>
              device.DeviceTags?.includes(personaTag(item.Label))
            )
            .map(deviceId)
        : []
    )
  }, [item, devices])

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>
        <Input size="md" variant="underlined">
          <InputField
            value={label}
            placeholder="alice"
            autoCapitalize="none"
            onChangeText={setLabel}
          />
        </Input>
        <FormControlHelper>
          <FormControlHelperText>
            Devices get a persona:{normalizeLabel(label) || 'name'} tag
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Description</FormControlLabelText>
        </FormControlLabel>
        <Input size="md" variant="underlined">
          <InputField
            value={description}
            placeholder="Alice's devices"
            onChangeText={setDescription}
          />
        </Input>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Devices</FormControlLabelText>
        </FormControlLabel>

        <ClientSelect
          key={selected.length}
          value=""
          onChange={(ip) => {
            let device = selectableDevices(devices).find(
              (d) => d.RecentIP?.replace(/\/.*/, '') == ip
            )
            if (device && !selected.includes(deviceId(device))) {
              setSelected(selected.concat(deviceId(device)))
            }
          }}
        />

        <HStack space="sm" flexWrap="wrap" mt="$2">
          {selected.map((id) => {
            let device = devices.find((d) => deviceId(d) == id)
            return (
              <Badge
                key={id}
                action="muted"
                variant="outline"
                size="sm"
                py="$1"
                px="$2"
                rounded="$lg"
              >
                <BadgeText>{device?.Name || id}</BadgeText>
                <Pressable
                  ml="$1"
                  onPress={() =>
                    setSelected(selected.filter((sid) => sid != id))
                  }
                >
                  <BadgeIcon as={CloseIcon} />
                </Pressable>
              </Badge>
            )
          })}
          {!selected.length ? (
            <Text size="sm" color="$muted500">
              No devices selected
            </Text>
          ) : null}
        </HStack>
      </FormControl>

      <Button
        action="primary"
        onPress={() =>
          onSave(
            { Label: normalizeLabel(label), Description: description.trim() },
            selected
          )
        }
      >
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const Personas = () => {
  const context = useContext(AlertContext)
  const [personas, setPersonas] = useState([])
  const [devices, setDevices] = useState([])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const addRef = useRef(null)
  const editRef = useRef(null)

  const refresh = () => {
    dbAPI
      .getItem('personas', 'list')
      .then((result) => setPersonas(result || []))
      .catch(() => {})

    deviceAPI
      .list()
      .then((result) => {
        setDevices(Array.isArray(result) ? result : Object.values(result))
      })
      .catch(() => {})
  }

  useEffect(() => {
    refresh()
  }, [])

  const members = (persona) =>
    devices.filter((device) =>
      device.DeviceTags?.includes(personaTag(persona.Label))
    )

  const savePersonaList = (next) =>
    dbAPI.putItem('personas', 'list', next).then(() => setPersonas(next))

  const syncDeviceTags = async (original, persona, selected) => {
    for (let device of selectableDevices(devices)) {
      let id = deviceId(device)
      let tags = device.DeviceTags || []
      let had = original ? tags.includes(personaTag(original.Label)) : false
      let want = selected.includes(id)
      let renamed = original && original.Label != persona.Label

      if (had == want && !(want && renamed)) {
        continue
      }

      let nextTags = tags.filter(
        (tag) =>
          tag != personaTag(persona.Label) &&
          (!original || tag != personaTag(original.Label))
      )
      if (want) {
        nextTags.push(personaTag(persona.Label))
      }

      await deviceAPI.updateTags(id, nextTags)
    }
  }

  const handleSave = (original) => async (persona, selected) => {
    if (!persona.Label) {
      context.error('Persona needs a name')
      return
    }

    let others = personas.filter((p) => p.Label != original?.Label)
    if (others.find((p) => p.Label == persona.Label)) {
      context.error(`Persona "${persona.Label}" already exists`)
      return
    }

    try {
      await savePersonaList(others.concat(persona))
      await syncDeviceTags(original, persona, selected)
    } catch (err) {
      context.error('Failed to save persona: ' + err.message)
    }

    if (original) {
      editRef.current()
      setEditing(null)
    } else {
      addRef.current()
    }

    refresh()
  }

  const deletePersona = async (persona, clearDevices) => {
    setDeleting(null)

    try {
      if (clearDevices) {
        for (let device of members(persona)) {
          await deviceAPI.updateTags(
            deviceId(device),
            (device.DeviceTags || []).filter(
              (tag) => tag != personaTag(persona.Label)
            )
          )
        }
      }
      await savePersonaList(personas.filter((p) => p.Label != persona.Label))
    } catch (err) {
      context.error('Failed to delete persona: ' + err.message)
    }

    refresh()
  }

  const moreMenu = (persona) => (
    <Menu
      trigger={(triggerProps) => (
        <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
          <ButtonIcon as={ThreeDotsIcon} color="$muted500" />
        </Button>
      )}
      selectionMode="single"
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'edit') {
          setEditing(persona)
          editRef.current()
        } else if (key == 'delete') {
          setDeleting(persona)
        }
      }}
    >
      <MenuItem key="edit" textValue="edit">
        <Icon as={EditIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Edit...</MenuItemLabel>
      </MenuItem>
      <MenuItem key="delete" textValue="delete">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  return (
    <VStack>
      <ModalForm title="Edit Persona" modalRef={editRef}>
        <AddPersona item={editing} devices={devices} onSave={handleSave(editing)} />
      </ModalForm>

      <ListHeader
        title="Personas"
        description="Group devices under a person to target them together, for example in firewall rules"
      >
        <ModalForm title="Add Persona" triggerText="Add Persona" modalRef={addRef}>
          <AddPersona item={null} devices={devices} onSave={handleSave(null)} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={personas}
        renderItem={({ item }) => (
          <ListItem>
            <Icon as={UserIcon} color="$muted500" size={16} />

            <VStack flex={1}>
              <Text bold>{item.Label}</Text>
              <Text size="sm" color="$muted500" isTruncated>
                {item.Description || ' '}
              </Text>
            </VStack>

            <HStack
              flex={2}
              space="sm"
              flexWrap="wrap"
              display="none"
              sx={{ '@md': { display: 'flex' } }}
            >
              {members(item).map((device) => (
                <Badge
                  key={deviceId(device)}
                  action="muted"
                  variant="outline"
                  size="sm"
                  py="$1"
                  px="$2"
                  rounded="$lg"
                >
                  <BadgeText>{device.Name || deviceId(device)}</BadgeText>
                </Badge>
              ))}
            </HStack>

            <Text size="sm" color="$muted500" sx={{ '@md': { display: 'none' } }}>
              {members(item).length}{' '}
              {members(item).length == 1 ? 'device' : 'devices'}
            </Text>

            {moreMenu(item)}
          </ListItem>
        )}
        keyExtractor={(item) => item.Label}
      />

      {!personas.length ? (
        <VStack space="md" alignItems="center" py="$8">
          <Icon as={UserIcon} color="$muted400" size={32} />
          <Text color="$muted500" size="sm">
            No personas yet
          </Text>
        </VStack>
      ) : null}

      <AlertDialog isOpen={deleting !== null} onClose={() => setDeleting(null)}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="md">Delete persona "{deleting?.Label}"?</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text size="sm">
              {deleting && members(deleting).length
                ? `${members(deleting).length} ${
                    members(deleting).length == 1 ? 'device has' : 'devices have'
                  } the ${personaTag(deleting.Label)} tag. Clear it from all devices?`
                : 'No devices have this persona.'}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="md">
              <Button
                size="sm"
                action="secondary"
                variant="outline"
                onPress={() => setDeleting(null)}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              {deleting && members(deleting).length ? (
                <Button
                  size="sm"
                  action="secondary"
                  onPress={() => deletePersona(deleting, false)}
                >
                  <ButtonText>Delete, keep tags</ButtonText>
                </Button>
              ) : null}
              <Button
                size="sm"
                action="negative"
                onPress={() => deletePersona(deleting, true)}
              >
                <ButtonText>
                  {deleting && members(deleting).length
                    ? 'Delete and clear'
                    : 'Delete'}
                </ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </VStack>
  )
}

export default Personas
