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

import { FlowCard, NewCard } from './FlowCard'
import ModalForm from 'components/ModalForm'
import AddFlowCard from './AddFlowCard'

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
            <ButtonText>Add card</ButtonText>
            <ButtonIcon as={AddIcon} ml="$1" />
          </Button>
        </>
      ) : null}
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
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            value={title}
            onChangeText={(value) => setTitle(value)}
            onSubmitEditing={onSubmit}
            placeholder="Name"
          />
        </Input>

        <FormControlHelper>
          <FormControlHelperText>
            Use a unique name to identify this flow
          </FormControlHelperText>
        </FormControlHelper>
      </FormControl>
      <VStack space="md">
        <FlowCardList
          title="When..."
          cards={triggers}
          onChange={setTriggers}
          cardType="trigger"
          edit={true}
        />
        <FlowCardList
          title="Then..."
          cards={actions}
          onChange={setActions}
          cardType="action"
          edit={true}
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
