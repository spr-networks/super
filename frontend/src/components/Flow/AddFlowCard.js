import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faClock, faEllipsis } from '@fortawesome/free-solid-svg-icons'

import { FlowCard } from './FlowCard'
import { getCards } from './FlowCards'

import {
  Badge,
  Box,
  Button,
  IconButton,
  FlatList,
  FormControl,
  HStack,
  VStack,
  Input,
  Menu,
  Select,
  Text,
  useColorModeValue
} from 'native-base'
import { Pressable } from 'react-native'

// TODO we should just list available flow cards for cardType here

//type = trigger or action
const AddFlowCard = ({ cardType, onSubmit, ...props }) => {
  const handleSelect = (item) => {
    onSubmit(item)
  }

  const cards = getCards(cardType)

  return (
    <VStack space={2}>
      <Text bold>Select a Card</Text>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.title}
        px={2}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleSelect(item)}>
            <FlowCard card={item} my={2} />
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
