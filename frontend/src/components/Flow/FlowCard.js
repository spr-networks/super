import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faCircleInfo, faEllipsis } from '@fortawesome/free-solid-svg-icons'

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

const FlowCard = ({ card, size, edit, ...props }) => {
  size = size || 'md'
  let { title, description } = card
  let icon = (
    <Icon
      icon={card.icon}
      color={card.color}
      size={size == 'xs' ? '8x' : '12x'}
    />
  )

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
              {card.values && card.values[p.name] !== undefined
                ? card.values[p.name] == ''
                  ? '*'
                  : card.values[p.name]
                : p.name}
            </Badge>
          ))}
      </HStack>
    </VStack>
  )

  if (edit) {
    if (card.values === undefined) {
      card.values = {}
    }

    body = (
      <HStack space={2} flexWrap="wrap" maxW="210px">
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Token
              key={p.name}
              label={p.name}
              value={
                card.values && card.values[p.name] !== undefined
                  ? card.values[p.name]
                  : p.name
              }
              description={p.description}
              format={p.format}
              size={Object.keys(card.values).length >= 5 ? 'xs' : 'sm'}
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
        Delete
      </Menu.Item>
    </Menu>
  )

  return (
    <Box
      bg={useColorModeValue('white', 'blueGray.700')}
      p={size == 'xs' ? 2 : 4}
      borderRadius={5}
      shadow={5}
      rounded="md"
      minW={350}
      mr={2}
      {...props}
    >
      <HStack justifyContent="stretch" alignItems="center" space={4}>
        <Box
          height={size == 'xs' ? 30 : 50}
          rounded="full"
          width={size == 'xs' ? 30 : 50}
          justifyContent="center"
          alignItems="center"
        >
          {icon}
        </Box>
        <VStack alignContent="center" space={size == 'xs' ? 0 : 1}>
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
