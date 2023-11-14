import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  HStack,
  Text,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Pressable,
  Popover,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
  PopoverCloseButton,
  PopoverHeader,
  CloseIcon,
  Heading,
  Icon,
  FormControl
} from '@gluestack-ui/themed'

import { SearchIcon, SlashIcon } from 'lucide-react-native'

const RouteJump = ({ ...props }) => {
  const [isOpen, setIsOpen] = useState(false)
  const refInput = React.useRef(null)

  const onPress = () => {
    console.log('ref=', refInput)

    setIsOpen(true)

    refInput.current?.focus()
  }

  const trigger = (triggerProps) => (
    <Pressable px="$4" {...triggerProps} onPress={onPress}>
      <Input size="sm" rounded="$md">
        <InputSlot pl="$3">
          <InputIcon as={SearchIcon} />
        </InputSlot>
        <InputField
          value=""
          onChangeText={() => {}}
          onSubmitEditing={() => {}}
          placeholder="Type / to search"
        />
        <InputSlot py="$1" px="$3" bg="$muted100" m="$1" rounded="$sm">
          <Text size="xs" color="$muted500">
            /
          </Text>
        </InputSlot>
      </Input>
    </Pressable>
  )

  const onChangeText = () => {}
  const onSubmitEditing = () => {}

  return (
    <>
      <Popover
        placement="bottom"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
      >
        <PopoverBackdrop />
        <PopoverContent minW={180}>
          <PopoverBody>
            {/*<PopoverCloseButton>
              <Icon as={CloseIcon} />
            </PopoverCloseButton>*/}
            <HStack space="md">
              <FormControl flex={1}>
                <Input rounded="$md">
                  <InputSlot pl="$3">
                    <InputIcon as={SearchIcon} />
                  </InputSlot>
                  <InputField
                    ref={refInput}
                    autoFocus={true}
                    value=""
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmitEditing}
                    placeholder="Jump to section"
                  />
                  <InputSlot
                    py="$1"
                    px="$3"
                    bg="$muted100"
                    m="$1"
                    rounded="$sm"
                  >
                    <Text size="xs" color="$muted500">
                      /
                    </Text>
                  </InputSlot>
                </Input>
              </FormControl>
            </HStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  )
}

export default RouteJump
