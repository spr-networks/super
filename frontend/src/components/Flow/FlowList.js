import { useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons'
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
const Flow = ({ title, edit, ...props }) => {
  const context = useContext(AlertContext)
  // NOTE we have multiple but only support one atm.
  const [triggers, setTriggers] = useState(props.triggers || [])
  const [actions, setActions] = useState(props.actions || [])

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
      props.onSubmit({ triggers, actions })
    }
  }

  return (
    <VStack maxW={360}>
      {title ? <Text bold>{title}</Text> : null}
      <Stack direction={edit ? 'column' : 'column'} space={4}>
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
          <Button
            variant="solid"
            colorScheme="primary"
            mt={4}
            onPress={onSubmit}
          >
            Save
          </Button>
        ) : null}
      </Stack>
    </VStack>
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)
  const [flows, setFlows] = useState([])

  // for testing
  /*
  useEffect(() => {
    let trigger = NewCard({
      title: 'Date',
      cardType: 'trigger',
      values: { days: 'mon,tue', from: '09:23', to: '16:23' }
    })

    let action = NewCard({
      title: 'Block TCP',
      cardType: 'action',
      values: { SrcIP: '192.168.2.23', DstIP: '23.23.23.23' }
    })

    setFlows([
      {
        title: 'Block 23.23.23.23 on weekdays',
        triggers: [trigger],
        actions: [action]
      }
    ])
  }, [])
  */

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

  const onSubmit = (data) => {
    // NOTE we only have one trigger + one action for now
    // TODO support multiple actions later
    console.log('save:', data)
    let triggers = data.triggers.map((card) => NewCard({ ...card }))
    let actions = data.actions.map((card) => NewCard({ ...card }))

    // TODO add when api is ok
    let flow = { title: 'Flow#new', triggers, actions }
    setFlows(flows.concat(flow))

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

    let trigger = triggers[0],
      action = actions[0]

    // TODO if the action is block
    if (action.title.match(/Block (TCP|UDP)/)) {
      let block = flowToApi(trigger, action)

      return console.log('block this:', block)

      pfwAPI
        .addBlock(block)
        .then((res) => {})
        .catch((err) => {
          context.error(err)
        })
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

      pfwAPI
        .addForward(forward)
        .then((res) => {})
        .catch((err) => {
          context.error(err)
        })
    }
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p={4}
      mb={4}
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="xl">Flows</Heading>
        </VStack>
      </HStack>

      <FlatList
        data={flows}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth={1}
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py={10}
          >
            <Flow
              title={item.title}
              triggers={item.triggers}
              actions={item.actions}
            />
          </Box>
        )}
        listKey="flow"
        keyExtractor={(item, index) => index}
      />

      <Divider my={4} color="violet.400" />

      <VStack space={4} maxW={350}>
        <Heading size="sm">Add flow</Heading>

        <FormControl>
          <FormControl.Label>Name</FormControl.Label>
          <Input
            variant="underlined"
            defaultValue="Flow#1"
            onChangeText={() => {}}
          />
          <FormControl.HelperText>
            Use a unique name to identify this flow
          </FormControl.HelperText>
        </FormControl>

        <Flow edit={true} onSubmit={onSubmit} />
      </VStack>
    </Box>
  )
}

export default FlowList
