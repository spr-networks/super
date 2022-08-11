import React, { useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faEllipsis,
  faCirclePlus,
  faCheck,
  faTrash,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'AppContext'
import { FlowCard, NewCard } from './FlowCard'
import { numToDays, toCron } from './FlowCards'
import AddFlowCard from './AddFlowCard'
import { pfwAPI } from 'api/Pfw'

import {
  Box,
  Button,
  FlatList,
  FormControl,
  Heading,
  Input,
  IconButton,
  Menu,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue,
  Divider
} from 'native-base'
import { dateArrayToStr } from './Utils'

const FlowCardList = ({
  title,
  cards: defaultCards,
  cardType,
  edit,
  ...props
}) => {
  const [cards, setCards] = useState(defaultCards)
  let refModal = useRef(null)

  useEffect(() => {
    if (props.onChange) {
      props.onChange(cards)
    }
  }, [cards])

  useEffect(() => {
    setCards(defaultCards)
  }, [defaultCards])

  const addCard = (type) => {
    refModal.current()
  }

  const handleAddCard = (item) => {
    // one trigger, multiple actions
    if (
      cardType == 'trigger' &&
      cards.filter((card) => card.title === item.title).length
    ) {
      return
    }

    refModal.current()
    setCards(cards.concat(item))
  }

  const onChange = (item) => {
    setCards(cards.map((card) => (card.title == item.title ? item : card)))
  }

  const deleteCard = (index) => {
    let newCards = [...cards]
    newCards.splice(index, 1)
    setCards(newCards)
  }

  return (
    <VStack space={1}>
      <Text bold fontSize="sm">
        {title}
      </Text>

      <FlatList
        data={cards}
        listKey={`list${cardType}`}
        keyExtractor={(item, index) => index}
        renderItem={({ item, index }) => (
          <FlowCard
            edit={edit}
            card={item}
            onChange={onChange}
            onDelete={() => deleteCard(index)}
            mb={2}
          />
        )}
      />

      {edit ? (
        <>
          <ModalForm
            key={`form${cardType}`}
            title={`Add ${cardType} to flow`}
            modalRef={refModal}
          >
            <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
          </ModalForm>

          <Button
            _variant="subtle"
            variant="ghost"
            colorScheme="muted"
            rounded="md"
            leftIcon={<Icon icon={faCirclePlus} color="muted.500" />}
            onPress={() => addCard(cardType)}
            __disabled={cardType == 'trigger' && cards.length}
            display={{ base: cards.length ? 'none' : 'flex' }}
            key={'add' + cardType}
          >
            Add card
          </Button>
        </>
      ) : null}
    </VStack>
  )
}

// Add/Edit flow
const Flow = ({ flow, edit, ...props }) => {
  const context = useContext(AlertContext)
  // NOTE we have multiple but only support one atm.
  const [title, setTitle] = useState(flow.title)
  const [triggers, setTriggers] = useState(flow.triggers)
  const [actions, setActions] = useState(flow.actions)

  useEffect(() => {
    if (!flow || !flow.triggers || !flow.actions) {
      return
    }

    setTitle(flow.title)
    setTriggers(flow.triggers)
    setActions(flow.actions)
  }, [flow])

  //mini
  if (!edit) {
    const triggerBtn = (triggerProps) => (
      <IconButton
        variant="unstyled"
        ml="auto"
        icon={<Icon icon={faEllipsis} color="muted.600" />}
        {...triggerProps}
      ></IconButton>
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
        w={190}
        closeOnSelect={true}
        trigger={triggerBtn}
        alignSelf="center"
      >
        <Menu.Group title="Actions">
          <Menu.Item onPress={onDisable}>
            {flow.disabled ? 'Enable' : 'Disable'}
          </Menu.Item>
          {/*<Divider mt="3" w="100%" />*/}
          <Menu.Item onPress={onEdit}>Edit</Menu.Item>
          <Menu.Item onPress={onDuplicate}>Duplicate</Menu.Item>

          <Menu.Item onPress={onDelete}>
            <HStack space={2} alignItems="center">
              <Icon icon={faTrash} color="danger.700" />
              <Text color="danger.700">Delete</Text>
            </HStack>
          </Menu.Item>
        </Menu.Group>
      </Menu>
    )

    // TODO mini component

    let trigger = triggers[0],
      action = actions[0]

    if (!trigger || !action) {
      return <></>
    }

    const displayValue = (value, label) => {
      if (label == 'Client') {
        return value.Identity || value.Group || value.SrcIP
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
      <HStack
        __bg={useColorModeValue('white', 'blueGray.700')}
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        p={4}
        space={4}
        rounded="lg"
      >
        <VStack flex={1} space={2}>
          <HStack space={2} alignItems="flex-end">
            <Text bold>{title}</Text>
            {flow.disabled ? (
              <Text fontSize="xs" color="muted.500">
                Disabled
              </Text>
            ) : null}
          </HStack>

          <HStack space={4} justifyContent="flex-start">
            <HStack space={1} alignItems="center">
              <Icon icon={trigger.icon} color={trigger.color} />
              <HStack space={2}>
                {Object.keys(trigger.values).map((key) => (
                  <Text key={key}>
                    {displayValue(trigger.values[key], key)}
                  </Text>
                ))}
              </HStack>
            </HStack>
            <HStack space={2} alignItems="center">
              <Icon icon={action.icon} color={action.color} />
              <HStack space={2}>
                {Object.keys(action.values).map((key) => (
                  <Text key={key}>{displayValue(action.values[key], key)}</Text>
                ))}
              </HStack>
            </HStack>
          </HStack>
        </VStack>
        {moreMenu}
      </HStack>
    )
  }

  const onSubmit = () => {
    let data = []

    data.push(
      triggers.map((card) => {
        return { title: card.title, values: card.values }
      })
    )

    data.push(
      actions.map((card) => {
        return { title: card.title, values: card.values }
      })
    )

    if (props.onSubmit) {
      let newFlow = { title, triggers, actions }
      // update
      if (flow.index !== undefined) {
        newFlow.index = flow.index
      }

      props.onSubmit(newFlow)
    }
  }

  const onReset = () => {
    if (props.onReset) {
      props.onReset()
    }
  }

  return (
    <VStack maxW={380} space={2}>
      <FormControl>
        <FormControl.Label>Name</FormControl.Label>
        <Input
          variant="underlined"
          value={title}
          onChangeText={(value) => setTitle(value)}
          onSubmitEditing={onSubmit}
        />
        <FormControl.HelperText>
          Use a unique name to identify this flow
        </FormControl.HelperText>
      </FormControl>
      <Stack direction={edit ? 'column' : 'row'} space={4}>
        <FlowCardList
          title="When..."
          cards={triggers}
          onChange={setTriggers}
          cardType="trigger"
          edit={edit}
        />
        <FlowCardList
          title="Then..."
          cards={actions}
          onChange={setActions}
          cardType="action"
          edit={edit}
        />

        {edit ? (
          <VStack mt={4} space={2}>
            <Button
              variant="solid"
              colorScheme="primary"
              leftIcon={<Icon icon={faCheck} />}
              onPress={onSubmit}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              colorScheme="secondary"
              leftIcon={<Icon icon={faXmark} />}
              onPress={onReset}
            >
              Reset
            </Button>
          </VStack>
        ) : null}
      </Stack>
    </VStack>
  )
}

const saveFlow = async (flow) => {
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
  }

  data.disabled = flow.disabled

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
    title: 'Block ' + rule.Protocol.toUpperCase(),
    cardType: 'action',
    values: {
      Protocol: rule.Protocol,
      Client: rule.Client,
      DstIP: rule.DstIP,
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

  if (rule.Protocol != '') {
    action = NewCard({
      title: 'Forward ' + rule.Protocol.toUpperCase(),
      cardType: 'action',
      values: {
        Protocol: rule.Protocol,
        Client: rule.Client,
        OriginalDstIP: rule.OriginalDstIP,
        OriginalDstPort: rule.OriginalDstPort,
        DstIP: rule.DstIP,
        DstPort: rule.DstPort
      }
    })
  } else if (rule.DstInterface != '') {
    action = NewCard({
      title: 'Forward to Site VPN',
      cardType: 'action',
      values: {
        Client: rule.Client,
        OriginalDstIP: rule.OriginalDstIP,
        DstInterface: rule.DstInterface
      }
    })
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
        let flows = [
          ...result.BlockRules.map((x, i) => convertBlockRuleCard(x, i)),
          ...result.ForwardingRules.map((x, i) =>
            convertForwardingRuleCard(x, i)
          ),
          ...result.GroupRules.map((x, i) => convertGroupRuleCard(x, i)),
          ...result.TagRules.map((x, i) => convertTagRuleCard(x, i))
        ]

        setFlows(flows)
      })
      .catch((err) => {
        context.error(err)
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
    saveFlow(flow)
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
      actionTitle.match(/(Block|Forward) (TCP|UDP)/) ||
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
    <Stack
      direction={{ base: 'column', md: 'row' }}
      __bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      space={4}
      py={{ base: 0, md: 4 }}
    >
      <Box flex={1} display={{ base: 'flex' }}>
        <HStack justifyContent="space-between" alignContent="center" px={4}>
          <VStack space={2}>
            <Heading fontSize="md">Flows</Heading>
            {!flows.length ? <Text>No flows configured</Text> : null}
          </VStack>
        </HStack>

        <FlatList
          data={flows}
          renderItem={({ item, index }) => (
            <Box
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
              py={2}
            >
              <Flow
                edit={false}
                onDelete={() => onDelete(item, index)}
                onDuplicate={onDuplicate}
                onDisable={toggleDisable}
                onEdit={() => onEdit(item, index)}
                flow={item}
              />
            </Box>
          )}
          listKey="flow"
          keyExtractor={(item, index) => index}
        />
      </Box>

      <VStack
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        _rounded={{ md: 'md' }}
        space={4}
        w={{ base: '100%', md: '390px' }}
        mr={{ base: 0, lg: 8 }}
        p={4}
      >
        <Heading size="sm">Add &amp; Edit flow</Heading>

        <Flow edit={true} flow={flow} onSubmit={onSubmit} onReset={resetFlow} />
      </VStack>
    </Stack>
  )
}

export default FlowList
