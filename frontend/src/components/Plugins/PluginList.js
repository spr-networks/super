import React from 'react'
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
  Spinner
} from '@gluestack-ui/themed'
import { MonitorCheckIcon } from 'lucide-react-native'

import { ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'

import { pluginAPI } from 'api'
import { alertState } from 'AppContext'

const PluginListItem = ({ item, deleteListItem, handleChange, ...props }) => {
  const navigate = useNavigate()

  return (
    <ListItem>
      <VStack flex={1} space="sm">
        <Tooltip label={`URI: ${item.URI || 'not set'}`}>
          <Text size="md" bold>
            {item.Name}
          </Text>
        </Tooltip>

        <HStack space="sm">
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

          {item.Enabled && item.HasUI ? (
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
                <ButtonIcon as={MonitorCheckIcon} size={24} />
              </Button>
            </Tooltip>
          ) : null}
        </HStack>
      </VStack>

      <VStack
        flex={2}
        space="md"
        sx={{
          '@base': { display: 'none' },
          '@md': { display: 'flex' }
        }}
        alignItems="flex-end"
      >
        {item.ComposeFilePath ? (
          <HStack space="sm">
            <Text size="sm" color="$muted500">
              Compose Path
            </Text>
            <Text size="sm" isTruncated>
              {item.ComposeFilePath}
            </Text>
          </HStack>
        ) : null}
      </VStack>

      <HStack space="4xl">
        <Box w={100} alignItems="center" alignSelf="center">
          <Switch
            value={item.Enabled}
            onValueChange={() => handleChange(item, !item.Enabled)}
          />
        </Box>

        <Button
          alignSelf="center"
          variant="link"
          onPress={() => deleteListItem(item)}
          ml="$8"
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
