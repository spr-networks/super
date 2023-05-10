import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faEllipsis,
  faCircleInfo,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import { BrandIcons } from 'FontAwesomeUtils'
import {
  Badge,
  Box,
  IconButton,
  HStack,
  VStack,
  Menu,
  Text,
  Tooltip,
  useColorModeValue
} from 'native-base'

import { getCard } from './FlowCards'
import Token from './Token'

const flowObjParse = (x) => {
  if (typeof x == 'object') {
    if (x.Identity != null && x.Identity != '') return x.Identity

    if (x.Group != null && x.Group != '') return x.Group

    if (x.SrcIP != null && x.SrcIP != '') return x.SrcIP

    return JSON.stringify(x)
  }
  return x
}

const FlowCard = ({ card, size, edit, ...props }) => {
  size = size || 'md'
  let { title, description } = card
  let icon = null
  // if string use BrandIcons, else fontawesome component
  // NOTE this does not work in ios
  if (typeof card.icon == 'string') {
    icon = React.createElement(BrandIcons[card.icon], {
      color: card.color,
      size: 12
    })
  } else {
    icon = (
      <Icon
        icon={card.icon}
        color={card.color}
        size={size == 'xs' ? '8x' : '12x'}
      />
    )
  }

  const displayValueOrParam = (values, name) => {
    if (!values || values[name] === undefined) {
      return name
    }

    if (values[name] == '') {
      return '*'
    }

    if (Array.isArray(values[name])) {
      return values[name].join(',')
    }

    return values[name]
  }

  let body = (
    <VStack space={2}>
      <Text
        noOfLines={2}
        w="2/3"
        fontSize="sm"
        color={useColorModeValue('muted.700', 'muted.200')}
      >
        {description}
      </Text>
      <HStack space={1} flexWrap="wrap">
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Badge
              key={p.name}
              variant="outline"
              bg={useColorModeValue('muted.50', 'muted.700')}
              borderColor={useColorModeValue('muted.200', 'muted.600')}
              rounded="md"
              size="xs"
              py={0}
              px={1}
            >
              {displayValueOrParam(card.values, p.name)}
            </Badge>
          ))}
      </HStack>
    </VStack>
  )

  if (edit) {
    if (card.values === undefined) {
      card.values = {}
    }

    // autocomplete with dynamic options
    const [options, setOptions] = useState({})

    useEffect(async () => {
      if (card.getOptions) {
        let optionsNew = { ...options }

        for (let p of card.params) {
          let name = p.name
          let opts = await card.getOptions(name)
          if (opts && opts.length) {
            optionsNew[name] = opts
          }
        }

        setOptions(optionsNew)
      }
    }, [])

    body = (
      <HStack
        flex={1}
        flexWrap={'wrap'}
        space={1}
        maxW={{ base: '210px', md: '400px' }}
      >
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Token
              key={p.name}
              label={p.name}
              value={
                card.values && card.values[p.name] !== undefined
                  ? p.name == 'Client'
                    ? flowObjParse(card.values[p.name])
                    : card.values[p.name]
                  : p.name
              }
              options={options[p.name]}
              description={p.description}
              format={p.format}
              size={Object.keys(card.values).length > 10 ? 'xs' : 'md'}
              onChange={(value) => onChange(p.name, value)}
            />
          ))}
      </HStack>
    )
  }

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const onChange = (name, value) => {
    card.values[name] = value

    if (props.onChange) {
      props.onChange(card)
    }
  }

  const onDelete = () => {
    if (props.onDelete) {
      props.onDelete(card)
    }
  }

  const moreMenu = (
    <Menu w={190} p={0} closeOnSelect={true} trigger={trigger}>
      {/*<Menu.Item>Edit</Menu.Item>*/}
      <Menu.Item _text={{ color: 'danger.600' }} onPress={onDelete}>
        <HStack space={2} alignItems="center">
          <Icon icon={faTrash} color="danger.700" />
          <Text color="danger.700">Delete</Text>
        </HStack>
      </Menu.Item>
    </Menu>
  )

  return (
    <Box
      bg={useColorModeValue('light', 'backgroundContentDark')}
      p={size == 'xs' ? 2 : 4}
      rounded="md"
      shadow={{ md: 5 }}
      minW={320}
      mr={2}
      borderColor={useColorModeValue('coolGray.200', 'coolGray.900')}
      borderWidth={1}
      {...props}
    >
      <HStack justifyContent="space-between" alignItems="center" space={4}>
        <Box
          height={size == 'xs' ? 30 : 50}
          rounded="full"
          width={size == 'xs' ? 30 : 50}
          justifyContent="center"
          alignItems="center"
        >
          {icon}
        </Box>

        <VStack flex={1} alignContent="center" space={size == 'xs' ? 0 : 1}>
          <HStack space={1} alignItems="center">
            <Text color="muted.400" fontSize="sm">
              {title}
            </Text>
            {edit && description ? (
              <Tooltip
                label={description}
                bg="muted.800"
                _text={{ color: 'muted.200' }}
              >
                <IconButton
                  variant="unstyled"
                  icon={
                    <Icon icon={faCircleInfo} size="xs" color="muted.200" />
                  }
                />
              </Tooltip>
            ) : null}
          </HStack>
          {body}
        </VStack>

        {edit ? moreMenu : null}
      </HStack>
    </Box>
  )
}

const NewCard = ({ title, cardType, values, ...props }) => {
  let card = getCard(cardType, title)
  if (!card) {
    return
  }

  let newCard = { ...card }
  newCard.values = { ...newCard.values, ...values }

  return newCard
}

FlowCard.propTypes = {
  card: PropTypes.object.isRequired,
  size: PropTypes.string,
  edit: PropTypes.bool,
  onChange: PropTypes.func
}

export { FlowCard, NewCard }
export default FlowCard
