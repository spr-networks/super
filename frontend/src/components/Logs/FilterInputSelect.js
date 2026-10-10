import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { ModalContext } from 'AppContext'
import FilterSelect from './FilterSelect'
import { normalizeTextInput } from 'utils/normalizeTextInput'

import {
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Spinner,
  Text,
  CloseIcon
} from '@gluestack-ui/themed'

import { SlidersHorizontalIcon } from 'lucide-react-native'

const FilterInputSelect = ({
  value,
  topic,
  items,
  isInline,
  isLoading,
  onChangeText,
  onSubmitEditing,
  ...props
}) => {
  const modalContext = useContext(ModalContext)
  const textValue = normalizeTextInput(value)

  const onSubmitEditingPre = (text) => {
    onSubmitEditing(normalizeTextInput(text))
    modalContext.toggleModal()
  }

  const filterSelect = (
    <FilterSelect
      NoFilterCommon={props.NoFilterCommon}
      query={textValue}
      items={items}
      topic={topic}
      onSubmitEditing={onSubmitEditingPre}
    />
  )

  const handlePressFilter = () => {
    if (textValue.length) {
      onSubmitEditing('')
      return
    }

    modalContext.modal(`Set filter for ${topic}`, filterSelect)
  }

  return (
    <>
      <Input size="sm" rounded="$md" w="$full" {...props}>
        {isLoading ? (
          <InputSlot pl="$3">
            <Spinner size="small" />
          </InputSlot>
        ) : null}
        <InputField
          value={textValue}
          onChangeText={(text) => onChangeText?.(normalizeTextInput(text))}
          placeholder={props.placeholder || 'Search'}
          autoCapitalize="none"
        />

        <InputSlot pr="$3" onPress={handlePressFilter}>
          <InputIcon as={CloseIcon} display={textValue.length ? 'flex' : 'none'} />
          <InputIcon
            as={SlidersHorizontalIcon}
            display={textValue.length ? 'none' : 'flex'}
          />
        </InputSlot>
      </Input>
      {/*isInline ? filterSelect : null*/}
    </>
  )
}

FilterInputSelect.propTypes = {
  value: PropTypes.string,
  topic: PropTypes.string,
  items: PropTypes.array,
  onChangeText: PropTypes.func,
  onSubmitEditing: PropTypes.func,
  isLoading: PropTypes.bool,
  placeholder: PropTypes.string
}

export default FilterInputSelect
