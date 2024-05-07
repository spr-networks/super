import React, { useContext, useEffect, useRef, useState } from 'react'

import {
  Button,
  ButtonText,
  ButtonIcon,
  FlatList,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  HStack,
  VStack,
  ScrollView,
  Text,
  AddIcon,
  CheckIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { FlowCard } from './FlowCard'
import EditItem from './EditItem'
import ModalForm from 'components/ModalForm'
import AddFlowCard from './AddFlowCard'
import { flowObjParse } from './Utils'
import { Address4 } from 'ip-address'

const ActionForm = ({ item, onChange, onDelete, getOptions, ...props }) => {
  // autocomplete with dynamic options
  const [options, setOptions] = useState({})

  const fetchOptions = async () => {
    let optionsNew = { ...options }

    for (let p of item.params) {
      let name = p.name
      let opts = await getOptions(name)
      if (opts && opts.length) {
        optionsNew[name] = opts
      }
    }

    setOptions(optionsNew)
  }

  const onChangeValue = (name, value) => {
    if (name == 'Dst' || name == 'OriginalDst') {
      if (typeof value == 'object') {
        item.values[name] = value
      } else {
        //convert Dst/OriginalDst
        try {
          let address = new Address4(value)
          item.values[name] = { IP: value }
        } catch (err) {
          item.values[name] = { Domain: value }
        }
      }
    } else {
      item.values[name] = value
    }

    if (props.onChange) {
      props.onChange(card)
    }
  }

  useEffect(() => {
    if (getOptions) {
      fetchOptions()
    }
  }, [])

  return (
    <>
      <VStack flex={1} space="md">
        {item.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <HStack
              flexDirection="column"
              space="md"
              justifyContent="space-between"
              key={p.name}
            >
              <VStack
                space="xs"
                sx={{ '@md': { alignItems: 'flex-end', flexDirection: 'row' } }}
              >
                <Text size="sm" bold>
                  {p.name}
                </Text>
                <Text size="xs" color="$muted400">
                  {p.description}
                </Text>
              </VStack>
              <EditItem
                key={p.name}
                label={p.name}
                value={
                  item.values && item.values[p.name] !== undefined
                    ? p.name == 'Client' ||
                      p.name == 'Dst' ||
                      p.name == 'OriginalDst'
                      ? flowObjParse(item.values[p.name])
                      : item.values[p.name]
                    : p.name
                }
                options={options[p.name]}
                description={p.description}
                format={p.format}
                size={Object.keys(item.values).length > 10 ? 'xs' : 'xs'}
                onChange={(value) => onChangeValue(p.name, value)}
              />
            </HStack>
          ))}
      </VStack>
    </>
  )
}

//a list of cards
const FlowCardList = ({
  title,
  cards: defaultCards,
  cardType,
  showForm,
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

  const renderItem = ({ item, index }) => {
    if (showForm) {
      return (
        <ActionForm
          item={item}
          getOptions={item.getOptions}
          onChange={onChange}
          onDelete={() => deleteCard(index)}
        />
      )
    }

    //NOTE only for Always + Date triggers now
    return (
      <FlowCard
        edit={true}
        card={item}
        onChange={onChange}
        onDelete={() => deleteCard(index)}
        mb="$2"
      />
    )
  }

  return (
    <VStack space="sm">
      {/*<Text bold size="sm">
        {title}
      </Text>*/}

      <FlatList
        data={cards}
        listKey={`list${cardType}`}
        keyExtractor={(item, index) => index}
        renderItem={renderItem}
      />

      <ModalForm
        key={`form${cardType}`}
        title={`Add ${cardType} to flow`}
        modalRef={refModal}
        maxWidth="$full"
      >
        <ScrollView maxHeight={400}>
          <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
        </ScrollView>
      </ModalForm>

      <Button
        action="primary"
        variant="outline"
        onPress={() => addCard(cardType)}
        display={cards.length ? 'none' : 'flex'}
        key={'add' + cardType}
      >
        <ButtonText>Add {cardType}</ButtonText>
        <ButtonIcon as={AddIcon} ml="$1" />
      </Button>
    </VStack>
  )
}

const EditFlow = ({ flow, ...props }) => {
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
          <FormControlLabelText size="sm">Name</FormControlLabelText>
        </FormControlLabel>
        <Input>
          <InputField
            value={title}
            onChangeText={(value) => setTitle(value)}
            onSubmitEditing={onSubmit}
            placeholder="Name"
          />
        </Input>
      </FormControl>

      <VStack space="md">
        <FlowCardList
          title="When..."
          cards={triggers}
          onChange={setTriggers}
          cardType="trigger"
        />

        <FlowCardList
          title="Then..."
          cards={actions}
          onChange={setActions}
          cardType="action"
          showForm
        />

        <HStack my="$2" space="md">
          <Button flex={1} action="primary" variant="solid" onPress={onSubmit}>
            <ButtonText>Save</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$1" />
          </Button>
          <Button
            flex={1}
            action="secondary"
            variant="outline"
            onPress={onReset}
          >
            <ButtonText>Reset</ButtonText>
            <ButtonIcon as={CloseIcon} ml="$1" />
          </Button>
        </HStack>
      </VStack>
    </VStack>
  )

  /*return (
    <>
      <Text>{JSON.stringify(flow)}</Text>
    </>
  )*/
}

/*
              edit={true}
              flow={flow}
              onSubmit={onSubmit}
              onReset={resetFlow}
*/

export default EditFlow
