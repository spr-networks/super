import React from 'react'
import PropTypes from 'prop-types'
import { Dimensions } from 'react-native'

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

  let numColumns = Dimensions.get('window').width > 1024 ? 2 : 1
  let cardWidth = numColumns == 2 ? '$1/2' : '$full'

  //TODO only if Device.width>=1024
  return (
    <VStack space="md">
      <FlatList
        data={cards}
        numColumns={numColumns}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleSelect(item)} w={cardWidth} px="$1">
            <FlowCard edit={false} card={item} mb="$2" />
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
