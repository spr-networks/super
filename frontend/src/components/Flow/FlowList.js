import { useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faBan,
  faCirclePlus,
  faCheck,
  faEllipsis,
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

    const moreMenu = (
      <Menu
        flex={1}
        w={190}
        closeOnSelect={true}
        trigger={triggerBtn}
        alignSelf="center"
      >
        <Menu.Item onPress={onEdit}>Edit</Menu.Item>
        <Menu.Item onPress={onDuplicate}>Duplicate</Menu.Item>
        <Menu.Item _text={{ color: 'danger.600' }} onPress={onDelete}>
          Delete
        </Menu.Item>
      </Menu>
    )

    // TODO mini component

    let trigger = triggers[0],
      action = actions[0]

    if (!trigger || !action) {
      return <></>
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
          <Text bold>{title}</Text>

          <HStack space={4} justifyContent="start">
            <HStack space={1} alignItems="center">
              <Icon icon={trigger.icon} color={trigger.color} />
              <Text isTruncated>{Object.values(trigger.values).join(' ')}</Text>
            </HStack>
            <HStack space={2} alignItems="center">
              <Icon icon={action.icon} color={action.color} />
              <Text isTruncated>
                {Object.values(action.values).slice(0, 3).join(' ')}
              </Text>
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

const saveFlow =  async (flow) => {
  // NOTE only support Date+Block for now

  let trigger = flow.triggers[0],
    action = flow.actions[0]

  let data = { ...await trigger.onSubmit(), ...await action.onSubmit() }

  console.log('save flow')

  let isUpdate = flow.index !== undefined

  if (action.title.match(/Block (TCP|UDP)/)) {
    data.RuleName = flow.title

    if (isUpdate) {
      return pfwAPI.updateBlock(data, flow.index)
    }

    return pfwAPI.addBlock(data)
  }

  if (action.title.match(/Forward (TCP|UDP)/)) {
    data.RuleName = flow.title

    if (isUpdate) {
      return pfwAPI.updateForward(data, flow.index)
    }

    return pfwAPI.addForward(data)
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

  // load flows
  useEffect(() => {
    pfwAPI
      .config()
      .then((result) => {
        let flows = []
        for (let index in result.BlockRules) {
          let br = result.BlockRules[index]
          let days = numToDays(br.Time.Days),
            from = br.Time.Start,
            to = br.Time.End

          let trigger = NewCard({
            title: 'Date',
            cardType: 'trigger',
            values: { days, from, to }
          })

          let action = NewCard({
            title: 'Block ' + br.Protocol.toUpperCase(),
            cardType: 'action',
            values: {
              SrcIP: br.Client.SrcIP,
              DstIP: br.DstIP,
              DstPort: br.DstPort
            }
          })

          flows.push({
            title: br.RuleName,
            index: parseInt(index),
            triggers: [trigger],
            actions: [action]
          })
        }

        setFlows(flows)
        //setFlows()
      })
      .catch((err) => {})
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
        if (flow.index !== undefined) {
          let newFlows = flows
          newFlows[flow.index] = flow
          setFlows(newFlows)
        } else {
          setFlows(flows.concat(flow))
        }

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

  const onDelete = (flow, index) => {
    // update ui
    const done = () => {
      let newFlows = [...flows]
      newFlows.splice(flow, 1)
      for (let index = 0; index < newFlows.length; index++) {
        newFlows[index].index = index
      }

      setFlows(newFlows)
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

    let actionTitle = flow.actions[0].title

    if (actionTitle.match(/(Block|Forward) (TCP|UDP)/)) {
      let ruleType = actionTitle.startsWith('Block')
        ? 'BlockRules'
        : 'ForwardingRules'

      return ruleType == 'BlockRules'
        ? deleteBlock(index)
        : deleteForward(index)
    }
  }

  const onDuplicate = (item) => {
    //TODO add with title #2 + add to edit mode
    let newFlow = Object.assign({}, item)
    delete newFlow.index
    newFlow.title += '#copy'
    saveFlow(newFlow).then((res) => {
      newFlow.index = flows.length
      setFlow(newFlow)
      let newFlows = flows.concat(newFlow)
      setFlows(newFlows)
    })
  }

  return (
    <Stack
      direction={{ base: 'column', md: 'row' }}
      __bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      justifyContent="stretch"
      space={flows.length ? 4 : 0}
    >
      <Box flex={1} display={{ base: flows.length ? 'flex' : 'none' }}>
        <HStack justifyContent="space-between" alignContent="center">
          <VStack>
            <Heading fontSize="xl">Flows</Heading>
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
        flex={2}
        __bg={useColorModeValue('white', 'blueGray.700')}
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="lg"
        space={4}
        maxW={390}
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
