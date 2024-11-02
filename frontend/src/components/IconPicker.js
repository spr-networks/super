import React, { useContext, useEffect, useState } from 'react'

import {
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Input,
  InputField,
  VStack,
  Pressable,
  FormControl,
  ScrollView,
  Icon
} from '@gluestack-ui/themed'

import { ModalContext } from 'AppContext'

import IconItem from './IconItem'
import { Platform } from 'react-native'
import { Tooltip } from './Tooltip'

import { BrandIcons } from 'IconUtils'

const IconsList = ({ selected, setSelected, color }) => {
  const [filterText, setFilterText] = useState('')

  useEffect(() => {
    if (!filterText.length) {
      return
    }
  }, [filterText])

  let icons = []

  let okBrands = [
    'Apple',
    'Android',
    'Linux',
    'Microsoft',
    'PlayStation',
    'RaspberryPi',
    'Synology',
    'Sonos'
  ]

  let lucideIcons = [
    'Desktop',
    'Ethernet',
    'Laptop',
    'Mobile',
    'Router',
    'Tablet',
    'Tv',
    'Video',
    'Wifi',
    'Wire'
  ]

  icons = [...lucideIcons]
  //TODO veryify this works now on ios
  //if (Platform.OS == 'web') {
  let brandIcons = Object.keys(BrandIcons) /*.filter((name) =>
      okBrands.includes(name)
    )*/

  icons = [...lucideIcons, ...brandIcons]
  //}

  const filterIcons = (name) => {
    if (!filterText.length) {
      return true
    }

    return name.toLowerCase().includes(filterText.toLowerCase())
  }

  return (
    <>
      <FormControl>
        <Input variant="outline">
          <InputField
            type="text"
            value={filterText}
            autoFocus={true}
            placeholder="Search icons ..."
            onChangeText={(value) => setFilterText(value)}
            _onSubmitEditing={() => {}}
          />
        </Input>
      </FormControl>
      <ScrollView h={300}>
        <HStack
          flexWrap={'wrap'}
          justifyContent={{ base: 'space-between', md: 'flex-start' }}
        >
          {icons.filter(filterIcons).map((name) => (
            <Pressable
              onPress={() => setSelected(name)}
              p="$2"
              sx={{
                '@base': { px: '$1' },
                '@md': { px: '$2' }
              }}
              opacity={selected == name ? 1 : 0.5}
              key={`icon:${name}`}
            >
              <IconItem
                name={name}
                color={
                  selected == name && color ? `$${color}400` : '$blueGray500'
                }
                size={48}
              />
            </Pressable>
          ))}
        </HStack>
      </ScrollView>
    </>
  )
}

const IconPicker = ({ value, color, onChange, ...props }) => {
  const modalContext = useContext(ModalContext)

  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (value) {
      setSelected(value)
    }
  }, [])

  useEffect(() => {
    if (onChange && selected && value && selected != value) {
      onChange(selected) //icons.find((i) => i.name == selected)
    }
    //close modal when picking an icon
    modalContext.setShowModal(false)
  }, [selected])

  const onPress = () => {
    modalContext.modal(
      'Select Icon',
      <IconsList selected={selected} setSelected={setSelected} color={color} />
    )
  }

  return (
    <VStack
      space="md"
      sx={{
        '@md': {
          h: '$full',
          flexDirection: 'row',
          alignItems: 'center'
        }
      }}
    >
      <IconItem name={selected} color={`$${color}400`} size={64} />
      <HStack>
        <Button
          action="secondary"
          variant="outline"
          size="xs"
          onPress={onPress}
        >
          <ButtonText>Select Icon</ButtonText>
        </Button>
      </HStack>
    </VStack>
  )
}

export default IconPicker

export { IconPicker, IconItem }
