import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Badge,
  BadgeText,
  BadgeIcon,
  HStack,
  Input,
  InputField,
  InputSlot,
  Pressable,
  Text,
  useColorMode,
  VStack,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelperText
} from '@gluestack-ui/themed'

const KeyItem = ({ name, isSelected, onPress, ...props }) => {
  const colorMode = useColorMode()
  let bg = colorMode == 'light' ? '$primary200' : '$muted900'
  let fg = colorMode == 'light' ? '$muted800' : '$muted100'

  if (isSelected) {
    bg = colorMode == 'light' ? '$primary300' : '$muted600'
  }

  return (
    <Pressable onPress={() => onPress(name)}>
      <Badge
        action="muted"
        variant="solid"
        bg={bg}
        size="sm"
        py="$1"
        px="$2"
        rounded="$lg"
      >
        <BadgeText color={fg}>{name}</BadgeText>
        {/*<BadgeIcon color={fg} as={BracesIcon} ml="$1" />*/}
      </Badge>
    </Pressable>
  )
}

const buildQuery = (values) => {
  let qs = []

  //$..book[?(@.price==8.99 && @.category=='fiction')]
  //$[?(@.MAC=~"a0")]

  const toType = (v) => {
    if (parseInt(v) == v) {
      return v
    } else {
      return JSON.stringify(v)
    }
  }

  let keys = Object.keys(values)
  for (let k of keys) {
    let op = values[k].op
    let value = values[k].value
    qs.push(`@.${k}${op}${toType(value)}`)
  }

  let subqs = qs.join(' && ')
  let query = `$[?(${subqs})]`

  return query
}

const FilterSelect = ({ items, onSubmitEditing, query, ...props }) => {
  const [selected, setSelected] = useState(null)
  const [values, setValues] = useState({})
  const [keys, setKeys] = useState([])

  const extractKeys = (items) => {
    let keys = Object.keys(Array.isArray(items) ? items[0] : items)
    keys = keys.filter((k) => {
      return !['bucket', 'time'].includes(k)
    })

    return keys
  }

  useEffect(() => {
    if (!items) return
    //TODO recursive if needed
    let keys = extractKeys(items)

    // TODO set defaults here from query
    if (query) {
      //example query: $[?(@.MAC=~"a0")] matches everything within ()
      let m = query.match(/\$\[\?\(([^\(]+)\)\]/)
      console.log('TODO populate this:', m)
    }

    setKeys(keys)
  }, [])

  //TODO return syntax on select

  const onPressItem = (key) => {
    setSelected(selected == key ? null : key)
  }

  const onChangeText = (value) => {
    if (!selected) return
    let vals = values
    if (!value) {
      delete vals[selected]
    } else {
      let op = '=='
      //TODO support more: <,>,!=
      if (value.startsWith('^')) {
        op = '=~'
      }
      vals[selected] = { op, value }
    }

    setValues({ ...vals })
  }

  const onSelect = () => {
    let query = buildQuery(values)
    /*
    if (!query) {
      //TODO error invalid query
      return false
    }*/

    onSubmitEditing(query)
  }

  return (
    <VStack space="md">
      <VStack space="md">
        <HStack space="sm" flexWrap="wrap">
          {keys.map((k) => (
            <KeyItem
              name={k}
              isSelected={selected == k}
              onPress={onPressItem}
            />
          ))}
        </HStack>
        {selected != null ? (
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>
                Set query for "{selected}"
              </FormControlLabelText>
            </FormControlLabel>

            <Input size="md" variant="solid">
              <InputField
                autoFocus
                value={values[selected]?.value || ''}
                onChangeText={onChangeText}
                onSubmitEditing={onSelect}
                placeholder="Set value"
                type="text"
                autoCapitalize="none"
              />
              <InputSlot px="$2">
                <Text size="sm">{values[selected]?.op || '  '}</Text>
              </InputSlot>
            </Input>
            <FormControlHelperText size="xs">
              Prefix string with ^ for regexp.
            </FormControlHelperText>
          </FormControl>
        ) : (
          <Text size="md">Select item to edit</Text>
        )}
        {/*<Text size="xs">{JSON.stringify(values)}</Text>*/}
      </VStack>

      <VStack space="sm">
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Query</FormControlLabelText>
          </FormControlLabel>

          <HStack
            space="sm"
            rounded="$md"
            p="$2"
            bg="$primary200"
            sx={{ _dark: { bg: '$muted700' } }}
          >
            <Text size="sm">{buildQuery(values)}</Text>
          </HStack>
        </FormControl>
        <Button onPress={onSelect}>
          <ButtonText>Select Query</ButtonText>
        </Button>
      </VStack>

      <VStack space="sm">
        <Text size="xs" bold>
          Sample Item:
        </Text>
        <Text size="xs">{JSON.stringify(items[0])}</Text>
      </VStack>
    </VStack>
  )
}

FilterSelect.propTypes = {
  items: PropTypes.array,
  onSubmitEditing: PropTypes.func,
  query: PropTypes.string
}

export default FilterSelect
