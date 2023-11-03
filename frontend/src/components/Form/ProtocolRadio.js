import React from 'react'

import {
  Radio,
  RadioGroup,
  RadioIndicator,
  RadioIcon,
  RadioLabel,
  HStack,
  CircleIcon
} from '@gluestack-ui/themed'

const ProtocolRadio = ({ value, onChange, ...props }) => {
  return (
    <RadioGroup
      value={value}
      defaultValue={value}
      accessibilityLabel="Protocol"
      onChange={onChange}
    >
      <HStack py="$1" space="md">
        <Radio value="tcp" size="md">
          <RadioIndicator mr="$2">
            <RadioIcon as={CircleIcon} strokeWidth={1} />
          </RadioIndicator>
          <RadioLabel>TCP</RadioLabel>
        </Radio>
        <Radio value="udp" size="md">
          <RadioIndicator mr="$2">
            <RadioIcon as={CircleIcon} strokeWidth={1} />
          </RadioIndicator>
          <RadioLabel>UDP</RadioLabel>
        </Radio>
      </HStack>
    </RadioGroup>
  )
}

export default ProtocolRadio
