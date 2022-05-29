import { useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faAddressCard,
  faArrowRight,
  faArrowRightLong,
  faBan,
  faCircleInfo,
  faCirclePlus,
  faClock,
  faEllipsis,
  faPlus,
  faTag,
  faTags,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
//import AddBlock from './AddBlock'
import { AlertContext } from 'AppContext'
import { FlowCard, Cards } from './FlowCard'
import AddFlowCard from './AddFlowCard'

import {
  Badge,
  Box,
  Button,
  FlatList,
  FormControl,
  SectionList,
  Heading,
  IconButton,
  Input,
  Stack,
  HStack,
  VStack,
  Menu,
  Pressable,
  Text,
  Popover,
  useColorModeValue,
  Divider
} from 'native-base'

const CardList = ({ title, cards: defaultCards, cardType, ...props }) => {
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
    if (cards.filter((card) => card.title === item.title).length) {
      return
    }

    refModal.current()
    setCards(cards.concat(item))
  }

  const onChange = (item) => {
    setCards(cards.map((card) => (card.title == item.title ? item : card)))
  }

  const onDelete = (item) => {
    setCards(cards.filter((card) => card.title !== item.title))
  }

  return (
    <VStack maxW={340} space={2}>
      <Text bold>{title}</Text>

      <ModalForm title={`Add ${cardType} to flow`} modalRef={refModal}>
        <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
      </ModalForm>

      <FlatList
        data={cards}
        keyExtractor={(item, index) => index}
        renderItem={({ item, index }) => (
          <Box py={4}>
            <FlowCard
              edit={true}
              card={item}
              onChange={onChange}
              onDelete={onDelete}
            />
          </Box>
        )}
      />

      <Button
        _variant="subtle"
        variant="ghost"
        colorScheme="muted"
        rounded="md"
        leftIcon={<Icon icon={faCirclePlus} color="muted.500" />}
        onPress={() => addCard(cardType)}
        disabled={cards.length}
      >
        Add card
      </Button>
    </VStack>
  )
}

// Add/Edit flow
const Flow = (props) => {
  const context = useContext(AlertContext)
  const [triggers, setTriggers] = useState([])
  const [actions, setActions] = useState([])

  const onSubmit = () => {
    let data = []

    data.push(
      triggers.map((card) => {
        return { type: card.title, ...card.values }
      })
    )

    data.push(
      actions.map((card) => {
        return { type: card.title, ...card.values }
      })
    )

    console.log('save this:', data)
  }

  return (
    <VStack>
      <CardList
        title="When..."
        cards={triggers}
        onChange={setTriggers}
        cardType="trigger"
      />
      <CardList
        title="Then..."
        cards={actions}
        onChange={setActions}
        cardType="action"
      />
      <Button variant="solid" colorScheme="primary" mt={4} onPress={onSubmit}>
        Save
      </Button>
    </VStack>
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)

  //=trigger/actions
  /*
  let trigger = {
    title: 'Date',
    icon: faClock,
    color: 'violet.300',
    params: {
      from: '10:00',
      to: '18:00',
      days: ['mon', 'tue', 'wed', 'thu', 'fri']
    }
  }

  let action = {
    title: 'Block TCP',
    Protocol: 'tcp',
    SrcIP: '1.2.3.4',
    DstIP: '1.2.3.4'
  }*/

  // TODO render a card from values

  let values = {
    days: 'mon,tue',
    from: '10:23',
    to: '23:32'
  }

  let action = Object.assign({}, Cards.action[0])
  let trigger = Object.assign({}, Cards.trigger[0])

  trigger.params[0].value = 'mon,tue'
  trigger.params[1].value = '10:00'
  trigger.params[2].value = '14:00'

  let flows = [{ trigger, action }]

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

      <HStack space={3} justifyContent="space-around" alignItems="center">
        <Text w={360} bold textAlign="center" color="muted.700">
          When...
        </Text>
        <Text w={360} bold textAlign="center" color="muted.700">
          Then...
        </Text>
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
            <HStack space={3} justifyContent="space-around" alignItems="center">
              <FlowCard size="xs" card={item.trigger} />
              <FlowCard size="xs" card={item.action} />
            </HStack>
            <Box
              w={320}
              mx="auto"
              mt={-50}
              mb={50}
              style={{ positon: 'relative', zIndex: -1 }}
              alignItems="center"
            >
              <Icon icon={faArrowRightLong} color="muted.200" size="10x" />
            </Box>
          </Box>
        )}
        keyExtractor={(item, index) => index}
      />

      <Divider my={4} color="violet.400" />

      <Heading size="sm">Add flow</Heading>

      <Flow trigger={trigger} action={action} />

      {!flows.length ? <Text>There are no flows configured yet</Text> : null}
    </Box>
  )
}

/*
FlowList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}
*/

export default FlowList
