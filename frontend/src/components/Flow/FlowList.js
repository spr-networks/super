import { useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faCheck,
  faEllipsis,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'AppContext'
import { FlowCard, NewCard } from './FlowCard'
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
            disabled={cards.length}
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

const saveFlow = (flow) => {
  const toCron = (days, from, to) => {
    /*
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    |
│    │    │    │    │    └ day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31, L)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, optional)
    */

    let minute = '0',
      hour = '*',
      dom = '*',
      month = '*',
      dow = '*'

    //1. days
    let cronDays = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
      sun: 7
    }

    // default abbreviations
    if (days == 'weekdays') {
      days = 'mon,tue,wed,thu,fri'
    } else if (days == 'weekend') {
      days = 'sat,sun'
    }

    dow = days
      .split(',')
      .map((d) => cronDays[d])
      .filter((n) => typeof n === 'number')
      .join(',')

    //2. time
    let [fromH, fromM] = from.split(':')
    let [toH, toM] = to.split(':')

    hour = `${fromH}-${toH}`
    minute = `${fromM}-${toM}`

    // simplify
    if (minute == '00-00') {
      minute = '0'
    }

    let str = `0 ${minute} ${hour} ${dom} ${month} ${dow}`
    return str
  }

  // NOTE only support Date+Block for now
  const flowToApi = (trigger, action) => {
    // we use trigger for cronExpression && condition
    // TODO fallback for default cron

    if (trigger.title != 'Date') {
      return console.error('NOT IMPLEMENTED:', trigger)
    }

    let CronExpr = 'TODO'
    if (trigger.title == 'Date') {
      let { days, from, to } = trigger.values
      CronExpr = toCron(days, from, to)
    }

    let values = action.values
    let Client = { Group: '', Identity: '', SrcIP: '' }
    let cli = values.Client

    // TODO: fetch groups
    let groups = ['lan', 'wan', 'dns']

    // TODO better check here
    if (cli.split('.').length == 4) {
      Client.SrcIP = cli
    } else if (groups.includes(cli)) {
      Client.Group = cli
    } else {
      Client.Identity = cli
    }

    let block = {
      Client,
      DstIP: values.DstIP,
      DstPort: values.DstPort,
      Protocol: values.Protocol,
      CronExpr,
      Condition: 'TODO'
    }

    return block
  }

  let trigger = flow.triggers[0],
    action = flow.actions[0]

  // TODO if the action is block
  if (action.title.match(/Block (TCP|UDP)/)) {
    let block = flowToApi(trigger, action)

    return new Promise((resolve, reject) => {
      resolve(block)
    })

    return pfwAPI.addBlock(block)
  }

  //TODO
  if (action.title.match(/Forward (TCP|UDP)/)) {
    let forward = {
      Client: 'TODO',
      DstIP: '1.1.1.1',
      SrcPort: 2323,
      Protocol: 'tcp',
      CronExpr: 'TODO',
      Condition: 'TODO',

      NewDstIP: '2.2.2.2',
      DstPort: 2323
    }

    return new Promise((resolve, reject) => {
      resolve(forward)
    })

    return pfwAPI.addForward(forward)
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

  // for testing
  useEffect(() => {
    let trigger = NewCard({
      title: 'Date',
      cardType: 'trigger',
      values: { days: 'weekdays', from: '09:23', to: '16:23' }
    })

    let action = NewCard({
      title: 'Block TCP',
      cardType: 'action',
      values: { SrcIP: '192.168.2.23', DstIP: '23.23.23.23', DstPort: 80 }
    })

    setFlows([
      {
        title: 'Block 23 on weekdays',
        triggers: [trigger],
        actions: [action]
      }
    ])
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

  const onDelete = (item, index) => {
    let newFlow = flow
    flow.splice(index, 1)
    setFlow(newFlow)
  }

  const onDuplicate = (item) => {
    //TODO add with title #2 + add to edit mode
    let newFlow = Object.assign({}, item)
    newFlow.title += '#copy'
    newFlow.index = flows.length
    setFlow(newFlow)

    let newFlows = flows.concat(newFlow)
    setFlows(newFlows)
  }

  return (
    <Stack
      direction={{ base: 'column', md: 'row' }}
      __bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      justifyContent="stretch"
      space={4}
      p={4}
    >
      <Box flex={1}>
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
