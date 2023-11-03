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
  ChevronDownIcon
} from '@gluestack-ui/themed'

/*
//import { Select as NBSelect } //OLD

const Select = (props) => {
  const isSafari = () =>
    /Safari/.test(navigator.userAgent) &&
    /Apple Computer/.test(navigator.vendor);


  return (
    <NBSelect {...props} selection={isSafari() ? 1 : null}/>
  );
};

Select.Item = NBSelect.Item
export default Select
export { Select }
*/

const Select = (props) => {
  return (
    <SelectGS {...props}>
      <SelectTrigger variant="outline" size="md">
        <SelectInput placeholder="Select option" />
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
          {props.children}
        </SelectContent>
      </SelectPortal>
    </SelectGS>
  )
}

// behave like old Select
Select.Item = SelectItem

export { Select, SelectItem }
