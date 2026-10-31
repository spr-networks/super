import React, { useContext, useEffect, useRef, useState } from 'react'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  CloseIcon,
  FlatList,
  HStack,
  ScrollView,
  Text,
  VStack
} from '@gluestack-ui/themed'
import { PencilIcon, RotateCcwIcon } from 'lucide-react-native'

import { AlertContext } from 'layouts/Admin'
import { AppContext } from 'AppContext'
import { CoreDNS } from 'api/CoreDNS'
import ModalForm from 'components/ModalForm'
import DeviceItem from 'components/Devices/DeviceItem'
import { ListHeader, ListItem } from 'components/List'
import DNSHostnameForm, {
  hostnameErrorMessage
} from 'components/DNS/DNSHostnameForm'

const DNSHostnameListItem = ({ item, onEdit, onDelete, onReset }) => {
  const context = useContext(AppContext)
  const removed = !item.IPAddress

  return (
    <ListItem>
      <VStack
        flex={1}
        space="sm"
        sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
      >
        <VStack flex={2} space="xs">
          <Text bold>{item.Hostname}</Text>
          {item.DeviceName ? (
            <Text size="xs" color="$muted500">
              Device {item.DeviceName}
            </Text>
          ) : null}
        </VStack>
        <Text flex={1} color={removed ? '$muted500' : undefined}>
          {removed ? 'Removed' : item.IPAddress}
        </Text>
        <HStack flex={2}>
          <DeviceItem
            item={context.getDevice(item.IPAddress, 'RecentIP')}
            hideMissing={true}
          />
        </HStack>
      </VStack>

      <HStack space="sm" alignItems="center">
        {item.Reserved ? (
          <Badge action="error" variant="outline">
            <BadgeText>Reserved</BadgeText>
          </Badge>
        ) : null}
        {item.Pinned ? (
          <Badge action="info" variant="outline">
            <BadgeText>Pinned</BadgeText>
          </Badge>
        ) : null}
        {item.Pinned ? (
          <Button
            variant="link"
            accessibilityLabel={`Reset ${item.Hostname}`}
            onPress={() => onReset(item)}
          >
            <ButtonIcon as={RotateCcwIcon} color="$muted500" />
          </Button>
        ) : null}
        {!item.Reserved && !removed ? (
          <Button
            variant="link"
            accessibilityLabel={`Edit ${item.Hostname}`}
            onPress={() => onEdit(item)}
          >
            <ButtonIcon as={PencilIcon} color="$muted500" />
          </Button>
        ) : null}
        {!removed ? (
          <Button
            variant="link"
            accessibilityLabel={`Delete ${item.Hostname}`}
            onPress={() => onDelete(item)}
          >
            <ButtonIcon as={CloseIcon} color="$red700" />
          </Button>
        ) : null}
      </HStack>
    </ListItem>
  )
}

const DNSHostnames = () => {
  const context = useContext(AlertContext)
  const [hostnames, setHostnames] = useState([])
  const [editing, setEditing] = useState(null)
  const refModalAdd = useRef(null)
  const refModalEdit = useRef(null)

  const refresh = () => {
    CoreDNS.hostnames()
      .then((list) => setHostnames(list || []))
      .catch(async (error) =>
        context.error(
          'Could not load hostnames',
          await hostnameErrorMessage(error, false)
        )
      )
  }

  useEffect(refresh, [])

  const onAdded = () => {
    refModalAdd.current?.()
    refresh()
  }

  const onEdited = () => {
    refModalEdit.current?.()
    setEditing(null)
    refresh()
  }

  const onEdit = (item) => {
    setEditing(item)
    refModalEdit.current?.()
  }

  const onDelete = (item) => {
    CoreDNS.deleteHostname(item.Hostname, { IPAddress: item.IPAddress })
      .then(refresh)
      .catch(async (error) => {
        context.error(
          'Could not delete hostname',
          await hostnameErrorMessage(error, true)
        )
        refresh()
      })
  }

  const onReset = (item) => {
    CoreDNS.resetHostname(item.Hostname)
      .then(refresh)
      .catch(async (error) => {
        context.error(
          'Could not reset hostname',
          await hostnameErrorMessage(error, true)
        )
        refresh()
      })
  }

  return (
    <ScrollView h="$full">
      <ListHeader title="Hostnames" description="Set lan DNS entries">
        <ModalForm
          title="Add Hostname"
          triggerText="Add Hostname"
          modalRef={refModalAdd}
        >
          <DNSHostnameForm notifyChange={onAdded} />
        </ModalForm>
      </ListHeader>

      <ModalForm
        title={`Edit ${editing?.Hostname || ''}`}
        modalRef={refModalEdit}
      >
        {editing ? (
          <DNSHostnameForm
            key={editing.Hostname}
            item={editing}
            notifyChange={onEdited}
          />
        ) : null}
      </ModalForm>

      {hostnames.length ? (
        <FlatList
          data={hostnames}
          keyExtractor={(item) => item.Hostname}
          renderItem={({ item }) => (
            <DNSHostnameListItem
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              onReset={onReset}
            />
          )}
        />
      ) : (
        <Text px="$4">No hostnames yet</Text>
      )}
    </ScrollView>
  )
}

export default DNSHostnames
