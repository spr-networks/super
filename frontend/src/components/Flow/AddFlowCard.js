import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faEllipsis } from '@fortawesome/free-solid-svg-icons'

import {
  Box,
  Button,
  IconButton,
  FormControl,
  HStack,
  VStack,
  Input,
  Menu,
  Select,
  Text,
  useColorModeValue
} from 'native-base'

// TODO we should just list available flow cards for cardType here

//type = trigger or action
const AddFlowCard = ({ cardType, ...props }) => {
  const [type, setType] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    //TODO validate
  }, [type])

  const handleSubmit = () => {
    //validate
  }

  return (
    <VStack space={2}>
      <FormControl isInvalid={'type' in errors}>
        <FormControl.Label>
          {cardType == 'trigger' ? 'When...' : 'Then...'}
        </FormControl.Label>
        <Select>
          <Select.Item label="Date" />
          <Select.Item label="Weekdays" />
          <Select.Item label="Something" />
        </Select>
        {'type' in errors ? (
          <FormControl.ErrorMessage
            _text={{
              fontSize: 'xs'
            }}
          >
            Invalid When trigger
          </FormControl.ErrorMessage>
        ) : (
          <FormControl.HelperText>Trigger action</FormControl.HelperText>
        )}
      </FormControl>

      <Button colorScheme="primary" onPress={handleSubmit}>
        Save
      </Button>
    </VStack>
  )
}

AddFlowCard.propTypes = {
  cardType: PropTypes.string.isRequired
}

export default AddFlowCard
