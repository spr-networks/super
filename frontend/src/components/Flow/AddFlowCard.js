import React from 'react'
import PropTypes from 'prop-types'

import { FlowCard } from './FlowCard'
import { getCards } from './FlowCards'

import { FlatList, Pressable, VStack, Text } from '@gluestack-ui/themed'

// TODO we should just list available flow cards for cardType here

//type = trigger or action
const AddFlowCard = ({ cardType, onSubmit, ...props }) => {
  const handleSelect = (item) => {
    onSubmit(item)
  }

  const cards = getCards(cardType)

  return (
    <VStack space="md">
      <Text bold>Select a Card</Text>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleSelect(item)}>
            <FlowCard edit={false} card={item} my="$2" />
          </Pressable>
        )}
      />
    </VStack>
  )
}

AddFlowCard.propTypes = {
  cardType: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired
}

export default AddFlowCard
