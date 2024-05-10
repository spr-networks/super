import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Icon,
  Input,
  InputField,
  InputSlot,
  ChevronDownIcon,
  ChevronUpIcon,
  Menu,
  Box,
  MenuItem,
  MenuItemLabel,
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicatorWrapper,
  ActionsheetDragIndicator,
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView,
  ActionsheetSectionList,
  ActionsheetSectionHeaderText
} from '@gluestack-ui/themed'

//TODO this is the new ClientSelect with any values and sections
const ActionSheet = ({ sections, value, placeholder, onChange, ...props }) => {
  const [showActionsheet, setShowActionsheet] = useState(false)
  const handleClose = () => setShowActionsheet(!showActionsheet)

  const onPress = (value) => {
    if (value == 'Show All') {
      value = ''
    }

    onChange(value)
    handleClose()
  }

  return (
    <>
      <Button size="xs" onPress={handleClose}>
        <ButtonText>{value || placeholder || 'Select'}</ButtonText>
      </Button>
      <Actionsheet
        isOpen={showActionsheet}
        onClose={handleClose}
        zIndex={999}
        useRNModal
      >
        <ActionsheetBackdrop />
        <ActionsheetContent>
          <ActionsheetScrollView>
            <ActionsheetDragIndicatorWrapper>
              <ActionsheetDragIndicator />
            </ActionsheetDragIndicatorWrapper>
            <ActionsheetSectionList
              h="$56"
              sections={sections}
              keyExtractor={(item, index) => item + index}
              renderItem={({ item }) => (
                <ActionsheetItem onPress={() => onPress(item)}>
                  <ActionsheetItemText>{item}</ActionsheetItemText>
                </ActionsheetItem>
              )}
              renderSectionHeader={({ section: { title, data } }) => (
                <ActionsheetSectionHeaderText display={title ? 'flex' : 'none'}>
                  {title} {/*({data.length})*/}
                </ActionsheetSectionHeaderText>
              )}
            />
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>
    </>
  )
}

export default ActionSheet
