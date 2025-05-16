import React, { useEffect, useState } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  BadgeText,
  Icon,
  CopyIcon,
  TrashIcon,
  Button,
  Switch,
  Divider,
  Pressable,
  useBreakpointValue
} from '@gluestack-ui/themed';
import {
  ChevronDown,
  Copy,
  Trash,
  ArrowRight,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react-native';

const Flow = ({ flow, ...props }) => {
  const [title, setTitle] = useState(flow?.title)
  const [triggers, setTriggers] = useState(flow?.triggers)
  const [actions, setActions] = useState(flow?.actions)
  const [showActions, setShowActions] = useState(false)

  useEffect(() => {
    if (flow?.triggers && flow?.actions) {
      setTitle(flow.title)
      setTriggers(flow.triggers)
      setActions(flow.actions)
    }
  }, [flow])

  useEffect(() => {
    if (title == 'NewFlow' && actions.length) {
      let title = actions[0].title
      setTitle(title)
    }
  }, [actions])

  const onDisable = () => {
    console.log('Flow onDisable called, current disabled state:', flow.disabled);
    if (props.onDisable) {
      props.onDisable(flow)
    }
  }

  const onDuplicate = () => {
    if (props.onDuplicate) {
      props.onDuplicate(flow)
    }
  }

  const onDelete = () => {
    if (props.onDelete) {
      props.onDelete(flow)
    }
  }

  let trigger = triggers[0],
    action = actions[0]

  if (!trigger || !action) {
    return <></>
  }

  const displayValue = (value, label) => {
    if (!value) {
      return value
    }

    if (label == 'Client') {
      return value.Identity || value.Group || value.SrcIP
    }

    if (label == 'Dst' || label == 'OriginalDst') {
      return value.IP || value.Domain
    }

    if (Array.isArray(value)) {
      return value.join(',')
    }

    if (label == 'days') {
      return dateArrayToStr(value.split(','))
    }

    return value
  }

  return (
    <VStack
      p="$4"
      py="$4"
      sx={{
        '@md': { p: '$8' },
        _dark: { bg: '$backgroundCardDark' }
      }}
      bg="$backgroundCardLight"
      space="md"
      shadow={2}
    >
      <Box sx={{ '@md': { display: 'none' } }}>
        <HStack justifyContent="flex-end" mb="$4">
          <HStack space="xs" alignItems="center">
            <Text size="sm" color="$muted500">{flow.disabled ? "Disabled" : "Enabled"}</Text>
                          <Switch
              size="sm"
              value={!flow.disabled}
              onValueChange={() => onDisable()}
            />
          </HStack>
        </HStack>


        <HStack space="md" justifyContent="center">
          <Button
            action="secondary"
            variant="link"
            onPress={onDuplicate}
            p="$1"
          >
            <CopyIcon color="$muted500" />
          </Button>

          <Button
            action="secondary"
            variant="link"
            onPress={onDelete}
            p="$1"
          >
            <TrashIcon color="$red700" />
          </Button>
        </HStack>
      </Box>

      <VStack sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }} space="md">
        <VStack space="md">
          <HStack space="md" alignItems="center">
            <HStack space="md" alignItems="center">
              <HStack space="md" alignItems="center">
                <HStack space="sm">
                  <Button
                    action="secondary"
                    variant="link"
                    onPress={onDuplicate}
                    p="$1"
                  >
                    <CopyIcon color="$muted500" />
                  </Button>

                  <Button
                    action="secondary"
                    variant="link"
                    onPress={onDelete}
                    p="$1"
                  >
                    <TrashIcon color="$red700" />
                  </Button>
                </HStack>

                <HStack space="xs" alignItems="center">
                  <Text size="sm" color="$muted500">{flow.disabled ? "Disabled" : "Enabled"}</Text>
                  <Switch
                    size="sm"
                    value={!flow.disabled}
                    onValueChange={onDisable}
                  />
                </HStack>
              </HStack>
            </HStack>
          </HStack>
        </VStack>

        { props.renderFields && (
          <HStack space="sm" flexWrap="wrap">
            {Object.keys(trigger.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(trigger.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}

            {Object.keys(action.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(action.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}
          </HStack>
        )}
      </VStack>

      { props.renderFields && (
        <Box sx={{ '@md': { display: 'none' } }}>
          <HStack space="sm" flexWrap="wrap" mt="$4">
            {Object.keys(trigger.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(trigger.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}

            {Object.keys(action.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(action.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}
          </HStack>
        </Box>
      )}
    </VStack>
  )
}

export default Flow;
