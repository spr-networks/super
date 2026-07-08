import React, { useContext, useEffect, useRef, useState } from 'react'
import { AlertContext } from 'AppContext'
import { deviceAPI, parentalAPI } from 'api'

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AddIcon,
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

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const emptyWindow = () => ({ Days: [0, 0, 0, 0, 0, 0, 0], Start: '00:00', End: '06:00' })

const ScheduleEditor = ({ schedule, onChange, onRemove }) => {
  const toggleDay = (i) => {
    let days = [...schedule.Days]
    days[i] = days[i] ? 0 : 1
    onChange({ ...schedule, Days: days })
  }

  return (
    <VStack
      space="sm"
      p="$2"
      borderWidth="$1"
      borderColor="$borderColorCardBorder"
      rounded="$md"
    >
      <HStack space="xs" flexWrap="wrap">
        {DAY_LABELS.map((d, i) => (
          <Button
            key={i}
            size="xs"
            variant={schedule.Days[i] ? 'solid' : 'outline'}
            action={schedule.Days[i] ? 'primary' : 'secondary'}
            onPress={() => toggleDay(i)}
          >
            <ButtonText>{d}</ButtonText>
          </Button>
        ))}
      </HStack>
      <HStack space="sm" alignItems="center">
        <Text size="sm">Block</Text>
        <Input w="$20" size="sm">
          <InputField
            value={schedule.Start}
            onChangeText={(v) => onChange({ ...schedule, Start: v })}
            placeholder="00:00"
          />
        </Input>
        <Text size="sm">to</Text>
        <Input w="$20" size="sm">
          <InputField
            value={schedule.End}
            onChangeText={(v) => onChange({ ...schedule, End: v })}
            placeholder="06:00"
          />
        </Input>
        <Button size="xs" variant="link" action="negative" onPress={onRemove}>
          <ButtonIcon as={CloseIcon} />
        </Button>
      </HStack>
    </VStack>
  )
}

const AddPersona = ({ item, limit, devices, onSave }) => {
  const [label, setLabel] = useState(item?.Label || '')
  const [description, setDescription] = useState(item?.Description || '')
  const [selected, setSelected] = useState([])
  const [dailyLimit, setDailyLimit] = useState('')
  const [schedules, setSchedules] = useState([])

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
    setDailyLimit(limit?.DailyLimitMinutes ? `${limit.DailyLimitMinutes}` : '')
    setSchedules(limit?.Schedules || [])
  }, [item, limit, devices])

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
          <FormControlLabelText>Daily internet limit (minutes)</FormControlLabelText>
        </FormControlLabel>
        <Input size="md" variant="underlined" w="$40">
          <InputField
            value={dailyLimit}
            placeholder="0 = no limit"
            keyboardType="numeric"
            onChangeText={setDailyLimit}
          />
        </Input>
        <FormControlHelper>
          <FormControlHelperText>
            Shared across all of this persona's devices, resets at 6am
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Block schedules</FormControlLabelText>
        </FormControlLabel>
        <VStack space="sm">
          {schedules.map((s, i) => (
            <ScheduleEditor
              key={i}
              schedule={s}
              onChange={(ns) => {
                let next = [...schedules]
                next[i] = ns
                setSchedules(next)
              }}
              onRemove={() => setSchedules(schedules.filter((_, idx) => idx !== i))}
            />
          ))}
          <Button
            size="xs"
            variant="outline"
            alignSelf="flex-start"
            onPress={() => setSchedules([...schedules, emptyWindow()])}
          >
            <ButtonIcon as={AddIcon} mr="$1" />
            <ButtonText>Add schedule</ButtonText>
          </Button>
        </VStack>
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
        onPress={() => {
          let n = parseInt(dailyLimit, 10)
          onSave(
            { Label: normalizeLabel(label), Description: description.trim() },
            selected,
            { DailyLimitMinutes: isNaN(n) ? 0 : n, Schedules: schedules }
          )
        }}
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
  const [limits, setLimits] = useState({}) // tag -> { DailyLimitMinutes, Schedules }
  const [usage, setUsage] = useState({}) // tag -> { Used, Limit, Blocked, GrantUntil }
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const addRef = useRef(null)
  const editRef = useRef(null)

  const refreshUsage = () => {
    parentalAPI
      .usage()
      .then((u) => setUsage(u || {}))
      .catch(() => {})
  }

  const refresh = () => {
    deviceAPI
      .list()
      .then((result) => {
        setDevices(Array.isArray(result) ? result : Object.values(result))
      })
      .catch(() => {})

    parentalAPI
      .personas()
      .then((list) => {
        let m = {}
        ;(list || []).forEach((p) => {
          m[p.Tag] = p
        })
        setLimits(m)
        setPersonas(
          (list || []).map((p) => ({
            Label: p.Name,
            Description: p.Description || ''
          }))
        )
      })
      .catch(() => {})

    refreshUsage()
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refreshUsage, 30 * 1000)
    return () => clearInterval(id)
  }, [])

  const members = (persona) =>
    devices.filter((device) =>
      device.DeviceTags?.includes(personaTag(persona.Label))
    )

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

  const handleSave = (original) => async (persona, selected, limitData) => {
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
      if (original && original.Label != persona.Label) {
        await parentalAPI.deletePersona({ Name: original.Label }).catch(() => {})
      }
      await parentalAPI.savePersona({
        Name: persona.Label,
        Tag: personaTag(persona.Label),
        Description: persona.Description,
        DailyLimitMinutes: limitData.DailyLimitMinutes,
        Schedules: limitData.Schedules
      })
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
      await parentalAPI.deletePersona({ Name: persona.Label })
    } catch (err) {
      context.error('Failed to delete persona: ' + err.message)
    }

    refresh()
  }

  const pausePersona = (persona) =>
    parentalAPI
      .pause(personaTag(persona.Label), 60)
      .then(refreshUsage)
      .catch(() => {})

  const extendPersona = (persona) =>
    parentalAPI
      .extend(personaTag(persona.Label), 30)
      .then(refreshUsage)
      .catch(() => {})

  const hasControls = (persona) =>
    (usage[personaTag(persona.Label)]?.Limit || 0) > 0 ||
    limits[personaTag(persona.Label)]?.Schedules?.length > 0

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

  const usageLine = (persona) => {
    let u = usage[personaTag(persona.Label)] || {}
    let parts = []
    if ((u.Limit || 0) > 0) {
      parts.push(`${u.Used || 0}m of ${u.Limit}m today`)
    }
    let lim = limits[personaTag(persona.Label)]
    if (lim?.Schedules?.length) {
      parts.push(`${lim.Schedules.length} schedule(s)`)
    }
    return parts.join(' · ')
  }

  const statusBadge = (persona) => {
    let u = usage[personaTag(persona.Label)]
    if (!u) return null
    if (u.Blocked) {
      return (
        <Badge action="error" variant="solid" size="sm">
          <BadgeText>Timed out</BadgeText>
        </Badge>
      )
    }
    if (u.GrantUntil && u.GrantUntil * 1000 > Date.now()) {
      return (
        <Badge action="info" variant="solid" size="sm">
          <BadgeText>Extended</BadgeText>
        </Badge>
      )
    }
    if (hasControls(persona)) {
      return (
        <Badge action="success" variant="outline" size="sm">
          <BadgeText>Active</BadgeText>
        </Badge>
      )
    }
    return null
  }

  return (
    <VStack>
      <ModalForm title="Edit Persona" modalRef={editRef}>
        <AddPersona
          item={editing}
          limit={editing ? limits[personaTag(editing.Label)] : null}
          devices={devices}
          onSave={handleSave(editing)}
        />
      </ModalForm>

      <ListHeader
        title="Personas"
        description="Group devices under a person to target them together, set daily internet time limits and block schedules"
      >
        <ModalForm title="Add Persona" triggerText="Add Persona" modalRef={addRef}>
          <AddPersona item={null} limit={null} devices={devices} onSave={handleSave(null)} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={personas}
        renderItem={({ item }) => {
          let u = usage[personaTag(item.Label)] || {}
          return (
            <ListItem>
              <Icon as={UserIcon} color="$muted500" size={16} />

              <VStack flex={1}>
                <HStack space="sm" alignItems="center">
                  <Text bold>{item.Label}</Text>
                  {statusBadge(item)}
                </HStack>
                <Text size="sm" color="$muted500" isTruncated>
                  {usageLine(item) || item.Description || ' '}
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
                    action={u.Blocked ? 'error' : 'muted'}
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

              {u.Blocked ? (
                <Button size="xs" action="primary" onPress={() => extendPersona(item)}>
                  <ButtonText>Extend 30m</ButtonText>
                </Button>
              ) : hasControls(item) ? (
                <Button
                  size="xs"
                  variant="outline"
                  action="secondary"
                  onPress={() => pausePersona(item)}
                >
                  <ButtonText>Pause 1h</ButtonText>
                </Button>
              ) : null}

              {moreMenu(item)}
            </ListItem>
          )
        }}
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
