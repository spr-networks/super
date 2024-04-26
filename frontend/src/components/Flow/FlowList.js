import React, { useContext, useEffect, useState } from 'react'

import { AlertContext } from 'AppContext'
import { NewCard } from './FlowCard'
import { numToDays, toCron } from './FlowCards'
import EditFlow from './EditFlow'
import { pfwAPI } from 'api/Pfw'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  FlatList,
  Heading,
  Icon,
  HStack,
  VStack,
  Text,
  ScrollView,
  Menu,
  MenuItem,
  MenuItemLabel,
  ThreeDotsIcon,
  TrashIcon,
  CheckIcon,
  CopyIcon
} from '@gluestack-ui/themed'

import { dateArrayToStr } from './Utils'
import { PencilIcon, CircleSlashIcon } from 'lucide-react-native'

import { Tooltip } from 'components/Tooltip'

// Show flow card
const Flow = ({ flow, ...props }) => {
  // NOTE we have multiple but only support one atm.
  const [title, setTitle] = useState(flow.title)
  const [triggers, setTriggers] = useState(flow.triggers)
  const [actions, setActions] = useState(flow.actions)

  useEffect(() => {
    if (flow?.triggers && flow?.actions) {
      setTitle(flow.title)
      setTriggers(flow.triggers)
      setActions(flow.actions)
    }
  }, [flow])

  //set title when we update actions
  useEffect(() => {
    if (title == 'NewFlow' && actions.length) {
      let title = actions[0].title
      setTitle(title)
    }
  }, [actions])

  //mini

  const triggerBtn = (triggerProps) => (
    <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
  )

  const onEdit = () => {
    if (props.onEdit) {
      props.onEdit(flow)
    }
  }

  const onDelete = () => {
    if (props.onDelete) {
      props.onDelete(flow)
    }
  }

  const onDuplicate = () => {
    if (props.onDuplicate) {
      props.onDuplicate(flow)
    }
  }

  const onDisable = () => {
    if (props.onDisable) {
      props.onDisable(flow)
    }
  }

  const moreMenu = (
    <Menu
      flex={1}
      trigger={triggerBtn}
      selectionMode="single"
      closeOnSelect={true}
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'disable') {
          onDisable()
        } else if (key == 'edit') {
          onEdit()
        } else if (key == 'duplicate') {
          onDuplicate()
        } else if (key == 'delete') {
          onDelete()
        }
      }}
    >
      <MenuItem key="disable">
        <Icon
          as={flow.disabled ? CheckIcon : CircleSlashIcon}
          color={flow.disabled ? '$success700' : '$red700'}
          mr="$2"
        />
        <MenuItemLabel size="sm">
          {flow.disabled ? 'Enable' : 'Disable'}
        </MenuItemLabel>
      </MenuItem>
      <MenuItem key="edit">
        <Icon as={PencilIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Edit</MenuItemLabel>
      </MenuItem>
      <MenuItem key="duplicate">
        <CopyIcon color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Duplicate</MenuItemLabel>
      </MenuItem>

      <MenuItem key="delete">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel color="$red700">Delete</MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  // TODO mini component

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
        '@base': { flexDirection: 'column-reverse' },
        '@md': { flexDirection: 'row', p: '$8' },
        _dark: { bg: '$backgroundCardDark' }
      }}
      bg="$backgroundCardLight"
      space="md"
      shadow={2}
    >
      <VStack flex={1} space="md">
        <HStack space="md" alignItems="center">
          <HStack space="md">
            <Icon as={trigger.icon} color={trigger.color} />
            <Icon as={action.icon} color={action.color} />
          </HStack>
          <Text bold>{title}</Text>
          {flow.disabled ? (
            <Text size="xs" color="$muted500">
              Disabled
            </Text>
          ) : null}
        </HStack>

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
      </VStack>
      {moreMenu}
    </VStack>
  )
}

const saveFlow = async (flow, context) => {
  let trigger = flow.triggers[0],
    action = flow.actions[0]

  console.log('flow. save:', flow)

  let data = {}

  try {
    data = {
      RuleName: flow.title,
      ...trigger.preSubmit(),
      ...(await action.preSubmit())
    }
  } catch (err) {
    context.error(err)
    return
  }

  data.Disabled = flow.disabled

  console.log('flow. put:', data)

  if (!action.submit) {
    console.error('missing submit action for', action)
  }

  return action.submit(data, flow)
}

const convertTrigger = (rule) => {
  let days = numToDays(rule.Time.Days),
    from = rule.Time.Start,
    to = rule.Time.End

  let trigger

  if (from != '') {
    trigger = NewCard({
      title: 'Date',
      cardType: 'trigger',
      values: { days, from, to }
    })
  } else {
    trigger = NewCard({
      title: 'Always',
      cardType: 'trigger',
      values: {}
    })
  }

  return trigger
}

const convertBlockRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Block',
    cardType: 'action',
    values: {
      Protocol: rule.Protocol,
      Client: rule.Client,
      Dst: rule.Dst,
      DstPort: rule.DstPort
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertForwardingRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action

  //NOTE: titles have to match or they will be invisible

  if (rule.DstInterface == '' && rule.Protocol != '') {
    action = NewCard({
      title: 'Forward',
      cardType: 'action',
      values: {
        Protocol: rule.Protocol,
        Client: rule.Client,
        OriginalDst: rule.OriginalDst,
        OriginalDstPort: rule.OriginalDstPort,
        Dst: rule.Dst,
        DstPort: rule.DstPort
      }
    })
  } else if (rule.DstInterface != '') {
    if (rule.Protocol == '') {
      action = NewCard({
        title: 'Forward all traffic to Interface, Site VPN or Uplink',
        cardType: 'action',
        values: {
          Client: rule.Client,
          OriginalDst: rule.OriginalDst,
          Dst: rule.Dst,
          DstInterface: rule.DstInterface
        }
      })
    } else {
      action = NewCard({
        title: 'Port Forward to Interface, Site VPN or Uplink',
        cardType: 'action',
        values: {
          Client: rule.Client,
          OriginalDst: rule.OriginalDst,
          OriginalDstPort: rule.OriginalDstPort,
          Dst: rule.Dst,
          Protocol: rule.Protocol,
          DstInterface: rule.DstInterface
        }
      })
    }
  }

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertGroupRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Set Device Groups',
    cardType: 'action',
    values: {
      Client: rule.Client,
      Groups: rule.Groups
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertTagRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Set Device Tags',
    cardType: 'action',
    values: {
      Client: rule.Client,
      Tags: rule.Tags
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const FlowList = (props) => {
  const context = useContext(AlertContext)
  const [flows, setFlows] = useState([])
  const [flow, setFlow] = useState({
    title: 'NewFlow',
    triggers: [],
    actions: []
  })

  // empty new/edit flow when adding/modifying flows
  const resetFlow = () => {
    setFlow({
      title: 'NewFlow',
      triggers: [],
      actions: []
    })
  }

  const fetchFlows = () => {
    pfwAPI
      .config()
      .then((result) => {
        if (result) {
          if (result.ForwardingRules == null) {
            result.ForwardingRules = []
          }
          if (result.BlockRules == null) {
            result.BlockRules = []
          }
          if (result.GroupRules == null) {
            result.GroupRules = []
          }
          if (result.TagRules == null) {
            result.TagRules = []
          }
          let flows = [
            ...result.BlockRules.map((x, i) => convertBlockRuleCard(x, i)),
            ...result.ForwardingRules.map((x, i) =>
              convertForwardingRuleCard(x, i)
            ),
            ...result.GroupRules.map((x, i) => convertGroupRuleCard(x, i)),
            ...result.TagRules.map((x, i) => convertTagRuleCard(x, i))
          ]
          setFlows(flows)
        }
      })
      .catch((err) => {
        context.error(err.message)
      })
  }

  // load flows
  useEffect(() => {
    fetchFlows()
  }, [])

  const onSubmit = (data) => {
    // NOTE we only have one trigger + one action for now
    if (!data.triggers.length) {
      return context.error('missing trigger')
    }

    if (!data.actions.length) {
      return context.error('missing actions')
    }

    let title = data.title || 'NewFlow#1'
    let triggers = data.triggers.map((card) => NewCard({ ...card }))
    let actions = data.actions.map((card) => NewCard({ ...card }))

    let flow = { title, triggers, actions }
    // update
    if (data.index !== undefined) {
      flow.index = data.index
    }

    // send flow to api
    saveFlow(flow, context)
      .then((res) => {
        // update ui
        fetchFlows()

        // empty new/edit flow when adding/modifying flows
        resetFlow()
      })
      .catch((err) => {
        context.error(err)
      })
  }

  const onEdit = (item, index) => {
    setFlow({ index, ...item })
  }

  const onDelete = (flow, _index) => {
    let index = flow.index
    // update ui
    const done = () => {
      fetchFlows()
    }

    const deleteBlock = (index) => {
      pfwAPI
        .deleteBlock(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteForward = (index) => {
      pfwAPI
        .deleteForward(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteGroups = (index) => {
      pfwAPI
        .deleteGroups(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteTags = (index) => {
      pfwAPI
        .deleteTags(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    let actionTitle = flow.actions[0].title

    if (
      actionTitle.match(/(Block|Forward)/) ||
      actionTitle.match(/Forward to Site VPN/)
    ) {
      let ruleType = actionTitle.startsWith('Block')
        ? 'BlockRules'
        : 'ForwardingRules'

      return ruleType == 'BlockRules'
        ? deleteBlock(index)
        : deleteForward(index)
    } else if (actionTitle.match(/Set Device (Groups|Tags)/)) {
      let ruleType = actionTitle.endsWith('Groups') ? 'Groups' : 'Tags'
      return ruleType == 'Groups' ? deleteGroups(index) : deleteTags(index)
    }
  }

  const onDuplicate = (item) => {
    //TODO add with title #2 + add to edit mode
    let newFlow = Object.assign({}, item)
    delete newFlow.index
    newFlow.title += '#copy'
    saveFlow(newFlow).then((res) => {
      fetchFlows()
    })
  }

  const toggleDisable = (item) => {
    item.disabled = !item.disabled
    saveFlow(item).then((res) => {
      fetchFlows()
    })
  }

  return (
    <ScrollView sx={{ '@md': { height: '92vh' } }}>
      <VStack sx={{ '@md': { flexDirection: 'row' } }}>
        <VStack py="$4" sx={{ '@md': { flex: 1 } }}>
          <HStack
            px="$4"
            pb="$4"
            justifyContent="space-between"
            alignContent="center"
            space="sm"
          >
            <Heading size="md">Flows</Heading>
            {!flows.length ? <Text>No flows configured</Text> : null}
          </HStack>

          <FlatList
            data={flows}
            renderItem={({ item, index }) => (
              <Box
                borderColor="$muted200"
                borderBottomWidth="$1"
                sx={{
                  _dark: { borderColor: '$muted900' },
                  '@md': {
                    pb: '$4',
                    px: '$4',
                    borderBottomWidth: '$0'
                  }
                }}
              >
                <Flow
                  flow={item}
                  onDelete={() => onDelete(item, index)}
                  onDisable={toggleDisable}
                  onDuplicate={onDuplicate}
                  onEdit={() => onEdit(item, index)}
                />
              </Box>
            )}
            listKey="flow"
            keyExtractor={(item, index) => index}
          />
        </VStack>

        <VStack
          sx={{
            '@md': {
              ml: 'auto',
              maxHeight: '$3/4',
              maxWidth: '$1/2'
            }
          }}
          flex={1}
        >
          {/*<Heading size="sm" my="$4" px="$4">
            Add &amp; Edit flow
          </Heading>*/}

          <Box
            bg="$backgroundCardLight"
            sx={{
              '@md': { rounded: 'md' },
              _dark: { bg: '$backgroundCardDark' }
            }}
            minH={450}
            p="$4"
          >
            <EditFlow
              edit={true}
              flow={flow}
              onSubmit={onSubmit}
              onReset={resetFlow}
            />
          </Box>
        </VStack>
      </VStack>
    </ScrollView>
  )
}

export default FlowList
