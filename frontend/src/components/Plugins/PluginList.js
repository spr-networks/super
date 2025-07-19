import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  FlatList,
  HStack,
  VStack,
  Switch,
  Text,
  CloseIcon,
  Spinner,
  Divider
} from '@gluestack-ui/themed'
import { MonitorCheckIcon, EditIcon } from 'lucide-react-native'

import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'
import ModalForm from 'components/ModalForm'
import EditPlugin from 'components/Plugins/EditPlugin'

import { pluginAPI } from 'api'
import { alertState } from 'AppContext'

const PluginListItem = ({ item, deleteListItem, handleChange, notifyChange, ...props }) => {
  const navigate = useNavigate()
  const editModalRef = useRef(null)

  const getFieldDisplay = (label, value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null
    
    return (
      <HStack space="sm" w="$full">
        <Text size="sm" color="$muted500" minWidth={120}>
          {label}:
        </Text>
        <Text size="sm" flex={1} numberOfLines={1}>
          {Array.isArray(value) ? value.join(', ') : value}
        </Text>
      </HStack>
    )
  }

  return (
    <ListItem>
      <VStack flex={1} space="md">
        <HStack space="md" alignItems="center">
          <Text size="lg" bold>
            {item.Name}
          </Text>
          
          {item.Version === undefined ? (
            <Spinner size="small" />
          ) : (
            <Badge
              variant="outline"
              action={item.Version ? 'success' : 'muted'}
              alignSelf="center"
            >
              <BadgeText>{item.Version || 'none'}</BadgeText>
            </Badge>
          )}
        </HStack>

        <VStack space="xs">
          {getFieldDisplay('URI', item.URI)}
          {getFieldDisplay('Git URL', item.GitURL)}
          {getFieldDisplay('Unix Path', item.UnixPath)}
          {getFieldDisplay('Compose Path', item.ComposeFilePath)}
          {getFieldDisplay('Token Path', item.InstallTokenPath)}
          {getFieldDisplay('Scoped Paths', item.ScopedPaths)}
        </VStack>

        <HStack space="sm" alignItems="center">
          {item.HasUI && (
            <Badge variant="solid" action="info">
              <BadgeText>Has UI</BadgeText>
            </Badge>
          )}
          
          {item.Plus && (
            <Badge variant="solid" action="warning">
              <BadgeText>PLUS</BadgeText>
            </Badge>
          )}
        </HStack>
      </VStack>

      <HStack space="md" alignItems="center">
        <Box w={80} alignItems="center">
          <Switch
            value={item.Enabled}
            onValueChange={() => handleChange(item, !item.Enabled)}
          />
        </Box>

        {item.Enabled && item.HasUI && (
          <Tooltip label={'Show plugin UI'}>
            <Button
              variant="link"
              action="secondary"
              size="sm"
              onPress={() =>
                navigate(
                  `/admin/custom_plugin/${encodeURIComponent(item.URI)}/`
                )
              }
            >
              <ButtonIcon as={MonitorCheckIcon} />
            </Button>
          </Tooltip>
        )}

        <ModalForm
          title={`Edit Plugin: ${item.Name}`}
          triggerComponent={
            <Button variant="solid" action="secondary" size="sm">
              <ButtonIcon as={EditIcon} />
            </Button>
          }
          modalRef={editModalRef}
        >
          <EditPlugin 
            plugin={item} 
            onClose={() => editModalRef.current?.()} 
            notifyChange={notifyChange}
          />
        </ModalForm>

        <Button
          variant="link"
          onPress={() => deleteListItem(item)}
        >
          <ButtonIcon as={CloseIcon} color="$red700" />
        </Button>
      </HStack>
    </ListItem>
  )
}

const PluginList = ({ list, deleteListItem, notifyChange, ...props }) => {
  const handleChange = (plugin, Enabled) => {
    plugin.Enabled = Enabled

    pluginAPI
      .update(plugin)
      .then((plugins) => {
        notifyChange(plugins)
      })
      .catch((err) => {
        alertState.error('Failed to update plugin state: ' + err.message)
      })

    if (plugin.Plus == true) {
      if (Enabled == false) {
        pluginAPI.stopPlusExtension(plugin.Name)
      } else {
        pluginAPI.startPlusExtension(plugin.Name)
      }
    }
  }

  const renderItem = ({ item }) => (
    <PluginListItem
      item={item}
      deleteListItem={deleteListItem}
      handleChange={handleChange}
      notifyChange={notifyChange}
    />
  )

  return (
    <FlatList
      data={list}
      estimatedItemSize={100}
      renderItem={renderItem}
      keyExtractor={(item) => JSON.stringify(item)}
    />
  )
}

export default PluginList
