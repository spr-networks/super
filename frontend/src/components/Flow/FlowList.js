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
            disabled={cardType == 'trigger' && cards.length}
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

  const onSubmit = (data) => {
    // NewCard .cardType
    console.log('gluehere:', data)
    let triggers = data.triggers.map((card) =>
      NewCard({ cardType: 'trigger', ...card })
    )

    let actions = data.actions.map((card) =>
      NewCard({ cardType: 'action', ...card })
    )

    let flow = { title: 'Flow#new', triggers, actions }

    // TODO if the action is block
    if (false == 'Block') {
      let block = {
        Client: 'TODO', //ClientIdentifier
        DstIP: '1.1.1.1',
        DstPort: 2323,
        Protocol: 'tcp',
        CronExpr: 'TODO',
        Condition: 'TODO'
      }

      pfwAPI
        .addBlock(block)
        .then((res) => {})
        .catch((err) => {
          context.error(err)
        })
    }

    if (false == 'Forward') {
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

    /*

type ClientIdentifier struct {
	Identity  string
	Group     string
	SrcIP     string
}

/block

type BlockRule struct {
	Client 		ClientIdentifier
	DstIP     string
	DstPort   string
	Protocol  string
	CronExpr  string
	Condition string
}

/forward

type ForwardingRule struct {
	Client		ClientIdentifier
	DstIP     string
	SrcPort   string
	Protocol  string
	CronExpr  string
	Condition string

	NewDstIP string
	DstPort  string
}

*/

    setFlows(flows.concat(flow))
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
