import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { ModalContext } from 'AppContext'
import FilterSelect from './FilterSelect'

import {
  Input,
  InputField,
  InputIcon,
  InputSlot,
  CloseIcon
} from '@gluestack-ui/themed'

import { SlidersHorizontalIcon } from 'lucide-react-native'

const FilterInputSelect = ({
  value,
  items,
  onChangeText,
  onSubmitEditing,
  ...props
}) => {
  const modalContext = useContext(ModalContext)

  const handlePressFilter = () => {
    if (value.length) {
      onSubmitEditing('')
      return
    }

    const onSubmitEditingPre = (text) => {
      onSubmitEditing(text)
      modalContext.toggleModal()
    }

    modalContext.modal(
      'Set Filter',
      <FilterSelect
        query={value}
        items={items}
        onSubmitEditing={onSubmitEditingPre}
      />
    )
  }

  return (
    <Input size="sm" rounded="$md" w="$full">
      <InputField
        autoFocus
        value={value}
        onChangeText={onChangeText}
        placeholder="Search"
      />

      <InputSlot pr="$3" onPress={handlePressFilter}>
        <InputIcon as={CloseIcon} display={value.length ? 'flex' : 'none'} />
        <InputIcon
          as={SlidersHorizontalIcon}
          display={value.length ? 'none' : 'flex'}
        />
      </InputSlot>
    </Input>
  )
}

FilterInputSelect.propTypes = {
  value: PropTypes.string,
  items: PropTypes.array,
  onChangeText: PropTypes.func,
  onSubmitEditing: PropTypes.func
}

export default FilterInputSelect
