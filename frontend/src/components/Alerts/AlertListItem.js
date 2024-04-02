import React, { useContext, useState } from 'react'
import { Platform } from 'react-native'

import { prettyDate } from 'utils'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Heading,
  HStack,
  Icon,
  VStack,
  Text,
  CheckIcon,
  MailIcon
} from '@gluestack-ui/themed'

import { EyeIcon, EyeOffIcon, AlertTriangleIcon } from 'lucide-react-native'

import { dbAPI } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import { ListItem } from 'components/List'
import LogListItem from 'components/Logs/LogListItem'
import { Tooltip } from 'components/Tooltip'
import { eventTemplate } from 'components/Alerts/AlertUtil'

const AlertListItem = ({ item, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

  const [showEvent, setShowEvent] = useState(item?.Body ? false : true)

  const updateEventState = (event, newState) => {
    let bucketKey = 'timekey:' + event.time
    event.State = newState
    dbAPI
      .putItem(event.AlertTopic, bucketKey, event)
      .then(() => {
        notifyChange(event)
      })
      .catch((err) => context.error('failed to update state:' + err))
  }

  const toggleEvent = (item) => {
    setShowEvent(!showEvent)
  }

  let notificationType =
    item?.NotificationType?.replace('danger', 'warning') || 'muted'
  let color = `$${notificationType}500`

  const isResolved = item.State == 'Resolved'

  const TitleComponent = (
    <>
      <HStack
        flex={1}
        space="sm"
        alignItems="center"
        opacity={isResolved ? 0.5 : 1}
      >
        <Icon size="sm" as={AlertTriangleIcon} color={color} />

        <Heading size="xs">
          {eventTemplate(appContext, item.Title, item.Event) ||
            item.Topic ||
            'Alert'}
        </Heading>
      </HStack>

      <Tooltip label={showEvent ? 'Hide Event' : 'Show Event'}>
        <Button
          ml="auto"
          action="primary"
          variant="link"
          size="sm"
          onPress={() => toggleEvent(item)}
          display={!item.Body ? 'none' : 'flex'}
        >
          <ButtonIcon as={showEvent ? EyeOffIcon : EyeIcon} ml="$2" />
        </Button>
      </Tooltip>
      <Text size="xs" bold>
        {prettyDate(item.Timestamp || item.time)}
      </Text>
    </>
  )

  return (
    <ListItem
      alignItems="flex-start"
      flexDirection="row"
      bg="$coolGray50"
      borderColor="$secondary200"
      sx={{
        _dark: { bg: '$secondary900', borderColor: '$secondary800' }
      }}
      p="$0"
      mb="$1"
    >
      <VStack space="md" flex={4}>
        {/*
          TBD: state will be something like
          "" -> untriaged
          "Triaged" -> event has been triaged, priority set till exempel
          "Resolved" -> event has been resolved

          Title is an alert Title from the configuration
          Body is an alert body to be set from config
          */}

        <LogListItem
          item={item.Event}
          selected={item.Topic}
          borderBottomWidth="$0"
          TitleComponent={TitleComponent}
          isHidden={!showEvent}
          onPress={(t, w) => setShowEvent(true)}
        >
          <HStack
            flex={1}
            p="$4"
            display={!showEvent ? 'flex' : 'none'}
            alignSelf="center"
            alignItems="center"
          >
            {eventTemplate(appContext, item.Body, item.Event, true)}
          </HStack>
          <VStack
            space="sm"
            p="$4"
            sx={{ '@md': { flexDirection: 'row', justifyContent: 'flex-end' } }}
          >
            <StateButton
              item={item}
              onPress={(action) => updateEventState(item, action)}
            />
          </VStack>
        </LogListItem>
      </VStack>
    </ListItem>
  )
}

//Flip from Resolved -> New, and New -> Resolved
const StateButton = ({ item, onPress, ...props }) => {
  let actions = {
    New: { action: 'Resolved', icon: CheckIcon, text: 'Mark as Read' },
    Resolved: { action: 'New', icon: MailIcon, text: 'Mark as Unread' }
    //Triaged: { action: 'Triaged', icon: SquareSlash, text: 'Triaged' },
  }

  let currentState = item.State || 'New'
  let { action, icon, text } = actions[currentState] || actions.New

  return (
    <Button
      action={currentState == 'New' ? 'primary' : 'secondary'}
      variant={currentState == 'New' ? 'outline' : 'outline'}
      size="xs"
      onPress={() => onPress(action)}
    >
      <ButtonText display="none" sx={{ '@md': { display: 'flex' } }}>
        {text}
      </ButtonText>
      <ButtonIcon as={icon} sx={{ '@md': { marginLeft: '$2' } }} />
    </Button>
  )
}

export default AlertListItem
