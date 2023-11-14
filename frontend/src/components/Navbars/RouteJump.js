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
  FormControl,
  VStack,
  Badge,
  BadgeIcon,
  BadgeText
} from '@gluestack-ui/themed'

import { SearchIcon, SlashIcon } from 'lucide-react-native'

import { routes } from 'routes'

const RouteJump = ({ ...props }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState([])

  const [filterText, setFilterText] = useState('')
  const navigate = useNavigate()

  const refInput = React.useRef(null)

  useEffect(() => {
    let items = []
    //flatten the routes
    routes.map((r) => {
      if (r.layout == 'auth' || r.redirect || r.hidden) return

      if (r.views) {
        let cr = r.views
          .map((rr) => {
            if (rr.redirect || rr.hidden) {
              return null
            }

            return { name: rr.name, path: rr.path, icon: rr.icon }
          })
          .filter((rr) => rr)

        items = [...items, ...cr]
      } else {
        items.push({ name: r.name, path: r.path, icon: r.icon })
      }
    })

    setItems(items)
  }, [])

  const onPress = () => {
    setIsOpen(true)
    refInput.current?.focus()
  }

  const trigger = (triggerProps) => (
    <Pressable px="$4" {...triggerProps} onPress={onPress}>
      <Input size="sm" rounded="$md" w={250}>
        <InputSlot pl="$3">
          <InputIcon as={SearchIcon} />
        </InputSlot>
        <InputField
          value=""
          onChangeText={() => {}}
          onSubmitEditing={() => {}}
          placeholder="Type / to search"
        />
        <InputSlot mr="$3.5">
          <Text size="xs" color="$muted500">
            /
          </Text>
        </InputSlot>
      </Input>
    </Pressable>
  )

  const filterItems = (value) => {
    let newItems = items?.map((item) => {
      if (item.name) {
        item.hidden = !item.name.toLowerCase().includes(value.toLowerCase())
      }

      return item
    })

    setItems(newItems)
  }

  const onChangeText = (value) => {
    setFilterText(value)
    filterItems(value)
  }

  const onSubmitEditing = (value) => {
    //navigate if one or just pick first
    if (!items?.length) {
      return
    }

    let item = null
    for (let r of items) {
      if (r.redirect) continue
      if (r.views) {
        let found = false
        for (let rr of r.views) {
          if (!rr.hidden && rr.path) {
            item = rr
            found = true
            break
          }
        }

        if (found) break
      }

      if (!r.hidden && r.path) {
        item = r
        break
      }
    }

    if (item?.path) {
      navigateItem(item)
    }
  }

  //navigate and reset form
  const navigateItem = (item) => {
    navigate(`/${item.layout || 'admin'}/${item.path}`)

    setFilterText('')
    filterItems('')

    setIsOpen(false)
  }

  return (
    <>
      <Popover
        placement="bottom left"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
        initialFocusRef={refInput}
        offset={-44}
      >
        <PopoverBackdrop />
        <PopoverContent maxWidth={280}>
          <PopoverBody>
            {/*<PopoverCloseButton>
              <Icon as={CloseIcon} />
            </PopoverCloseButton>*/}
            <VStack space="md">
              <FormControl>
                <Input size="sm" rounded="$md" w={250}>
                  <InputSlot pl="$3">
                    <InputIcon as={SearchIcon} />
                  </InputSlot>
                  <InputField
                    ref={refInput}
                    autoFocus={true}
                    value={filterText}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmitEditing}
                    placeholder="Jump to section"
                  />
                  <InputSlot mr="$3.5">
                    <Text size="xs">⏎</Text>
                  </InputSlot>
                </Input>
              </FormControl>
              <FormControl>
                <VStack space="sm" justifyContent="flex-start">
                  {items.map((item) => (
                    <Pressable
                      key={`${item.name}:${item.hidden}`}
                      onPress={() => navigateItem(item)}
                      display={item.hidden ? 'none' : 'flex'}
                      borderWidth="$1"
                      borderColor="$primary200"
                      px="$4"
                      py="$2"
                      rounded="$md"
                      sx={{
                        ':hover': { borderColor: '$primary400' },
                        _dark: {
                          borderColor: '$coolGray600',
                          ':hover': { borderColor: '$coolGray700' }
                        }
                      }}
                    >
                      <HStack>
                        <Icon as={item.icon} mr="$2" size="md" />
                        <Text size="sm">{item.name}</Text>
                      </HStack>
                    </Pressable>
                  ))}
                </VStack>
              </FormControl>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  )
}

export default RouteJump
