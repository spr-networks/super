import React, { useContext, useEffect, useRef, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { Icon as IconFA } from 'FontAwesomeUtils'

import ModalForm from 'components/ModalForm'
import { AlertContext } from 'AppContext'
import { FlowCard, NewCard } from './FlowCard'
import { numToDays, toCron } from './FlowCards'
import AddFlowCard from './AddFlowCard'
import { pfwAPI } from 'api/Pfw'

import {
  Box,
  Button,
  ButtonText,
  ButtonIcon,
  FlatList,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  Icon,
  Input,
  InputField,
  HStack,
  VStack,
  Text,
  ScrollView,
  AddIcon,
  ThreeDotsIcon,
  TrashIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon
} from '@gluestack-ui/themed'

import { Menu } from 'native-base' //TODONB

import { dateArrayToStr } from './Utils'
import { PencilIcon, ToggleLeftIcon } from 'lucide-react-native'
import { ToggleRightIcon } from 'lucide-react-native'

const FlowCardList = ({
  title,
  cards: defaultCards,
  cardType,
  edit,
  ...props
}) => {
  const [cards, setCardsCall] = useState(defaultCards)
  let refModal = useRef(null)

  const setCards = (cards) => {
    if (props.onChange) {
      props.onChange(cards)
    }
    setCardsCall(cards)
  }

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
    <VStack space="sm">
      <Text bold size="sm">
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
            mb="$2"
          />
        )}
      />

      {edit ? (
        <>
          <ModalForm
            key={`form${cardType}`}
            title={`Add ${cardType} to flow`}
            modalRef={refModal}
            w="full"
          >
            <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
          </ModalForm>

          <Button
            action="primary"
            variant="outline"
            onPress={() => addCard(cardType)}
            __disabled={cardType == 'trigger' && cards.length}
            display={{ base: cards.length ? 'none' : 'flex' }}
            key={'add' + cardType}
          >
            <ButtonText>Add card</ButtonText>
            <ButtonIcon as={AddIcon} ml="$1" />
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

  //set title when we update actions
  useEffect(() => {
    if (title == 'NewFlow' && actions.length) {
      let title = actions[0].title
      setTitle(title)
    }
  }, [actions])

  //mini
  if (!edit) {
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
        w={190}
        closeOnSelect={true}
        trigger={triggerBtn}
        alignSelf="center"
      >
        <Menu.Group title="Actions">
          <Menu.Item onPress={onDisable}>
            <HStack space="md" alignItems="center">
              <Icon
                as={flow.disabled ? ToggleRightIcon : ToggleLeftIcon}
                color="$muted500"
              />
              <Text>{flow.disabled ? 'Enable' : 'Disable'}</Text>
            </HStack>
          </Menu.Item>
          <Menu.Item onPress={onEdit}>
            <HStack space="md" alignItems="center">
              <Icon as={PencilIcon} color="$muted500" />
              <Text>Edit</Text>
            </HStack>
          </Menu.Item>
          <Menu.Item onPress={onDuplicate}>
            <HStack space="md" alignItems="center">
              <CopyIcon color="$muted500" />
              <Text>Duplicate</Text>
            </HStack>
          </Menu.Item>

          <Menu.Item onPress={onDelete}>
            <HStack space="md" alignItems="center">
              <TrashIcon color="$red700" />
              <Text color="$red700">Delete</Text>
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
      <VStack
        p="$2"
        py="$6"
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
              <IconFA icon={trigger.icon} color={trigger.color} />
              <IconFA icon={action.icon} color={action.color} />
            </HStack>
            <Text bold>{title}</Text>
            {flow.disabled ? (
              <Text size="xs" color="$muted500">
                Disabled
              </Text>
            ) : null}
          </HStack>

          <HStack space="md" flexWrap={'wrap'} px="$1">
            {Object.keys(trigger.values).map((key) => (
              <Text key={key}>{displayValue(trigger.values[key], key)}</Text>
            ))}

            {Object.keys(action.values).map((key) => (
              <Text key={key}>{displayValue(action.values[key], key)}</Text>
            ))}
          </HStack>
        </VStack>
        {moreMenu}
      </VStack>
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
    <VStack maxW={380} sx={{ '@md': { maxW: '$full' } }} space="md">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            value={title}
            onChangeText={(value) => setTitle(value)}
            onSubmitEditing={onSubmit}
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Use a unique name to identify this flow
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>
      <VStack flexDirection={edit ? 'column' : 'row'} space="md">
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
          <VStack mt="$4" space="md">
            <Button action="primary" variant="solid" onPress={onSubmit}>
              <ButtonText>Save</ButtonText>
              <ButtonIcon as={CheckIcon} ml="$1" />
            </Button>
            <Button action="secondary" variant="outline" onPress={onReset}>
              <ButtonText>Reset</ButtonText>
              <ButtonIcon as={CloseIcon} ml="$1" />
            </Button>
          </VStack>
        ) : null}
      </VStack>
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

  //NOTE: titles have to match or they will be invisible

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
      title: 'Forward to Site VPN or Uplink Interface',
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

  let h = Dimensions.get('window').height - (Platform.OS == 'ios' ? 64 * 2 : 64)

  return (
    <ScrollView>
      <VStack sx={{ '@md': { flexDirection: 'row' } }}>
        <VStack py="$4">
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
        </VStack>

        <VStack
          sx={{
            '@md': {
              ml: 'auto',
              mr: '$4',
              maxH: '$3/4',
              maxW: '500px'
            }
          }}
          flex={1}
        >
          <Heading size="sm" my="$4" px="$4">
            Add &amp; Edit flow
          </Heading>

          <Box
            bg="$backgroundCardLight"
            sx={{
              '@md': { rounded: 'md' },
              _dark: { bg: '$backgroundCardDark' }
            }}
            minH={450}
            p="$4"
          >
            <Flow
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
