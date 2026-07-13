import React, { useContext, useState } from 'react'

import { prettyDate, timeAgo } from 'utils'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Icon,
  VStack,
  Text,
  CheckIcon,
  MailIcon,
  View
} from '@gluestack-ui/themed'

import { EyeIcon, EyeOffIcon, AlertTriangleIcon } from 'lucide-react-native'

import { dbAPI } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import LogListItem from 'components/Logs/LogListItem'
import { Tooltip } from 'components/Tooltip'
import { eventTemplate } from 'components/Alerts/AlertUtil'
import AlertResolution from 'components/Alerts/AlertResolution'
import AlertIgnoreResolution from 'components/Alerts/AlertIgnoreResolution'
import { getAlertResolution } from 'components/Alerts/AlertResolutionUtil'
import {
  isAlertResolved,
  normalizeAlertState
} from 'components/Alerts/AlertStateUtil'

const AlertListItem = ({ item, notifyChange, ...props }) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

  const [showEvent, setShowEvent] = useState(item?.Body ? false : true)

  const updateEventState = async (event, newState) => {
    const bucketKey = 'timekey:' + event.time
    const updatedEvent = { ...event, State: newState }
    try {
      await dbAPI.putItem(event.AlertTopic, bucketKey, updatedEvent)
      notifyChange(updatedEvent)
      return true
    } catch (err) {
      context.error('failed to update state:' + err)
      return false
    }
  }

  const toggleEvent = () => {
    setShowEvent(!showEvent)
  }

  const notificationType =
    item?.NotificationType?.replace('danger', 'error') || 'muted'
  const color = `$${notificationType}500`
  const iconBackground = `$${notificationType}100`
  const iconBackgroundDark = `$${notificationType}900`
  const severityLabel =
    notificationType === 'error'
      ? 'Critical'
      : notificationType === 'warning'
        ? 'Warning'
        : 'Info'

  const isResolved = isAlertResolved(item)
  const resolution = getAlertResolution(item, appContext.devices || [])

  const TitleComponent = (
    <VStack
      flex={1}
      minWidth={0}
      py="$2"
      space="sm"
      opacity={isResolved ? 0.55 : 1}
      sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
    >
      <HStack
        flex={1}
        minWidth={0}
        space="sm"
        alignItems="flex-start"
      >
        <View
          w={32}
          h={32}
          flexShrink={0}
          borderRadius="$full"
          bg={iconBackground}
          alignItems="center"
          justifyContent="center"
          sx={{ _dark: { bg: iconBackgroundDark } }}
        >
          <Icon size="sm" as={AlertTriangleIcon} color={color} />
        </View>

        <VStack flex={1} minWidth={0} space="xs">
          <Text size="sm" fontWeight="$semibold">
            {eventTemplate(appContext, item.Title, item.Event) ||
              item.Topic ||
              'Alert'}
          </Text>
          <HStack space="sm" alignItems="center" minWidth={0}>
            <Badge
              action={notificationType}
              variant="outline"
              size="sm"
              borderRadius="$full"
              flexShrink={0}
            >
              <BadgeText>{severityLabel}</BadgeText>
            </Badge>
            <Text
              flex={1}
              minWidth={0}
              numberOfLines={1}
              size="xs"
              color="$textLight500"
              sx={{ _dark: { color: '$textDark400' } }}
            >
              {item.Topic || 'Network event'}
            </Text>
          </HStack>
        </VStack>
      </HStack>

      <HStack
        pl="$10"
        space="sm"
        alignItems="center"
        justifyContent="space-between"
        sx={{ '@md': { paddingLeft: '$0', justifyContent: 'flex-end' } }}
      >
        <Tooltip label={prettyDate(item.Timestamp || item.time)}>
          <Text
            size="xs"
            color="$textLight500"
            fontWeight="$medium"
            sx={{ _dark: { color: '$textDark400' } }}
          >
            {timeAgo(item.Timestamp || item.time)}
          </Text>
        </Tooltip>
        <Tooltip label={showEvent ? 'Hide event' : 'Show event'}>
          <Button
            action="primary"
            variant="link"
            size="sm"
            onPress={toggleEvent}
            display={!item.Body ? 'none' : 'flex'}
          >
            <ButtonIcon as={showEvent ? EyeOffIcon : EyeIcon} />
          </Button>
        </Tooltip>
      </HStack>
    </VStack>
  )

  return (
    <LogListItem
      item={item.Event}
      selected={item.Topic}
      borderWidth={1}
      borderRadius="$md"
      overflow="hidden"
      mb="$2"
      TitleComponent={TitleComponent}
      headerActionsDesktopOnly={true}
      headerActions={
        <>
          <AlertIgnoreResolution
            item={item}
            onResolved={() => updateEventState(item, 'Resolved')}
          />
          <StateButton
            item={item}
            hasResolution={Boolean(resolution)}
            onPress={(action) => updateEventState(item, action)}
          />
        </>
      }
      contentProps={{ flexDirection: 'column' }}
      isHidden={!showEvent}
      onPress={() => setShowEvent(true)}
    >
      <VStack w="$full">
        <HStack
          w="$full"
          minWidth={0}
          p="$4"
          display={!showEvent ? 'flex' : 'none'}
          alignItems="center"
          flexWrap="wrap"
        >
          {eventTemplate(appContext, item.Body, item.Event, true)}
        </HStack>
        <AlertResolution
          item={item}
          resolution={resolution}
          onResolved={() => updateEventState(item, 'Resolved')}
        />
        <HStack
          w="$full"
          p="$3"
          space="sm"
          flexWrap="wrap"
          borderTopWidth={1}
          borderColor="$borderColorCardLight"
          justifyContent="flex-end"
          display="flex"
          sx={{
            '@md': { display: 'none' },
            _dark: { borderColor: '$borderColorCardDark' }
          }}
        >
          <AlertIgnoreResolution
            item={item}
            onResolved={() => updateEventState(item, 'Resolved')}
          />
          <StateButton
            item={item}
            hasResolution={Boolean(resolution)}
            onPress={(action) => updateEventState(item, action)}
          />
        </HStack>
      </VStack>
    </LogListItem>
  )
}

//Flip from Resolved -> New, and New -> Resolved
const StateButton = ({ item, hasResolution, onPress, ...props }) => {
  const actions = {
    New: {
      action: 'Resolved',
      icon: CheckIcon,
      text: hasResolution ? 'Dismiss' : 'Resolve'
    },
    Resolved: { action: 'New', icon: MailIcon, text: 'Reopen' }
    //Triaged: { action: 'Triaged', icon: SquareSlash, text: 'Triaged' },
  }

  const currentState = normalizeAlertState(item.State)
  const { action, icon, text } = actions[currentState] || actions.New

  return (
    <Button
      action={
        currentState === 'New' && !hasResolution ? 'primary' : 'secondary'
      }
      variant="outline"
      size="xs"
      onPress={() => onPress(action)}
    >
      <ButtonText>{text}</ButtonText>
      <ButtonIcon as={icon} ml="$2" />
    </Button>
  )
}

export default AlertListItem
