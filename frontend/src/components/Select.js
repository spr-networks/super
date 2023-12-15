import React from 'react'

import {
  Icon,
  Select as SelectGS,
  SelectTrigger,
  SelectInput,
  SelectIcon,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicatorWrapper,
  SelectDragIndicator,
  SelectItem,
  SelectScrollView,
  ChevronDownIcon
} from '@gluestack-ui/themed'

/*
//import { Select as NBSelect } //OLD

const Select = NBSelect
export default Select

export { Select }
*/

const Select = (props) => {
  return (
    <SelectGS {...props}>
      <SelectTrigger variant="outline" size="md">
        <SelectInput placeholder={props.placeholder || 'Select option'} />
        <SelectIcon mr="$3">
          <Icon as={ChevronDownIcon} />
        </SelectIcon>
      </SelectTrigger>
      <SelectPortal>
        <SelectBackdrop />
        <SelectContent>
          <SelectDragIndicatorWrapper>
            <SelectDragIndicator />
          </SelectDragIndicatorWrapper>
          <SelectScrollView>{props.children}</SelectScrollView>
        </SelectContent>
      </SelectPortal>
    </SelectGS>
  )
}

// behave like old Select
Select.Item = SelectItem

export { Select, SelectItem }
