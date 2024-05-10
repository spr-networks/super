import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { ModalContext } from 'AppContext'
import FilterSelect from './FilterSelect'

import {
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Text,
  CloseIcon
} from '@gluestack-ui/themed'

import { SlidersHorizontalIcon } from 'lucide-react-native'

const FilterInputSelect = ({
  value,
  topic,
  items,
  isInline,
  onChangeText,
  onSubmitEditing,
  ...props
}) => {
  const modalContext = useContext(ModalContext)

  const onSubmitEditingPre = (text) => {
    onSubmitEditing(text)
    modalContext.toggleModal()
  }

  const filterSelect = (
    <FilterSelect
      NoFilterCommon={props.NoFilterCommon}
      query={value}
      items={items}
      topic={topic}
      onSubmitEditing={onSubmitEditingPre}
    />
  )

  const handlePressFilter = () => {
    if (value.length) {
      onSubmitEditing('')
      return
    }

    modalContext.modal(`Set filter for ${topic}`, filterSelect)
  }

  return (
    <>
      <Input size="sm" rounded="$md" w="$full" {...props}>
        <InputField
          value={value}
          onChangeText={onChangeText}
          placeholder={props.placeholder || 'Search'}
          autoCapitalize="none"
        />

        <InputSlot pr="$3" onPress={handlePressFilter}>
          <InputIcon as={CloseIcon} display={value.length ? 'flex' : 'none'} />
          <InputIcon
            as={SlidersHorizontalIcon}
            display={value.length ? 'none' : 'flex'}
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
  placeholder: PropTypes.string
}

export default FilterInputSelect
