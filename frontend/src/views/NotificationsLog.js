import React, { useEffect, useState } from 'react'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Pressable,
  Text,
  VStack,
  HStack
} from '@gluestack-ui/themed'

import { BellOffIcon, CopyIcon } from 'lucide-react-native'

import { ListHeader, ListItem } from 'components/List'
import { prettyDate, copy } from 'utils'
import {
  getNotificationsLog,
  clearNotificationsLog,
  subscribeNotificationsLog
} from 'NotificationsLog'

const typeAction = {
  success: 'success',
  warning: 'warning',
  danger: 'warning',
  error: 'error',
  info: 'info',
  confirm: 'info'
}

const NotificationsLogView = () => {
  const [entries, setEntries] = useState(getNotificationsLog())
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    return subscribeNotificationsLog(setEntries)
  }, [])

  const keyFor = (item, index) => `${item.time}-${index}`

  return (
    <VStack>
      <ListHeader
        title="Notifications"
        description="The most recent notifications from this session"
      >
        {entries.length ? (
          <Button
            size="sm"
            action="secondary"
            variant="outline"
            onPress={() => clearNotificationsLog()}
          >
            <ButtonText>Clear</ButtonText>
            <ButtonIcon as={BellOffIcon} ml="$1" />
          </Button>
        ) : null}
      </ListHeader>

      <FlatList
        data={entries}
        keyExtractor={keyFor}
        renderItem={({ item, index }) => {
          let isExpanded = expanded === keyFor(item, index)
          return (
            <Pressable
              onPress={() =>
                setExpanded(isExpanded ? null : keyFor(item, index))
              }
            >
              <ListItem>
                <Badge
                  action={typeAction[item.type] || 'muted'}
                  variant="outline"
                  size="sm"
                  rounded="$lg"
                >
                  <BadgeText>{item.type}</BadgeText>
                </Badge>

                <VStack flex={1} space="xs">
                  <HStack space="sm" alignItems="center">
                    <Text size="sm" bold>
                      {item.title}
                    </Text>
                    {item.count > 1 ? (
                      <Badge action="muted" variant="solid" size="sm">
                        <BadgeText>{`×${item.count}`}</BadgeText>
                      </Badge>
                    ) : null}
                  </HStack>
                  {item.body ? (
                    <Text
                      size="sm"
                      color="$muted500"
                      flexWrap="wrap"
                      numberOfLines={isExpanded ? undefined : 1}
                    >
                      {item.body}
                    </Text>
                  ) : null}
                </VStack>

                {isExpanded && item.body ? (
                  <Button
                    size="xs"
                    action="secondary"
                    variant="outline"
                    onPress={() => copy(`${item.title}: ${item.body}`)}
                  >
                    <ButtonIcon as={CopyIcon} />
                  </Button>
                ) : null}

                <Text size="xs" color="$muted400">
                  {prettyDate(item.time)}
                </Text>
              </ListItem>
            </Pressable>
          )
        }}
      />

      {!entries.length ? (
        <Text
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          p="$4"
        >
          No notifications yet.
        </Text>
      ) : null}
    </VStack>
  )
}

export default NotificationsLogView
