import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faClock, faEllipsis } from '@fortawesome/free-solid-svg-icons'

import { FlowCard, Cards } from './FlowCard'

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
  const [type, setType] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    //TODO validate
  }, [type])

  const handleSelect = (item) => {
    onSubmit(item)
  }

  const data = Cards[cardType]

  return (
    <VStack space={2}>
      <Text bold>Cards</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.title}
        px={2}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleSelect(item)}>
            <FlowCard
              title={item.title}
              description={
                <HStack space={1}>
                  {/*Object.keys(item.props).map((value) => (
                    <Badge
                      key={value}
                      variant="outline"
                      colorScheme="primary"
                      rounded="md"
                      size="sm"
                    >
                      {value}
                    </Badge>
                  ))*/}
                  {item.props.map((p) => (
                    <Badge
                      key={p.name}
                      variant="outline"
                      colorScheme="primary"
                      rounded="md"
                      size="sm"
                    >
                      {p.value || p.name}
                    </Badge>
                  ))}
                </HStack>
              }
              icon={<Icon icon={item.icon} color={item.color} size="8x" />}
              my={2}
            />
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
