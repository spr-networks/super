import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  HStack,
  Icon,
  VStack,
  Text,
  Tooltip,
  TooltipContent,
  TooltipText,
  ThreeDotsIcon,
  InfoIcon,
  TrashIcon,
  Menu,
  MenuItem,
  MenuItemLabel,
  CloseIcon
} from '@gluestack-ui/themed'

import { getCard } from './FlowCards'
import Token from './Token'
import { flowObjParse } from './Utils'
import { Address4 } from 'ip-address'

const FlowCard = ({ card, size, edit, ...props }) => {
  size = size || 'md'
  let { title, description } = card
  let icon = (
    <Icon
      as={card.icon}
      color={card.color}
      size={size == 'xs' ? 24 : 42}
      w="$full"
    />
  )

  const displayValueOrParam = (values, name) => {
    if (!values || values[name] === undefined) {
      return name
    }

    if (values[name] == '') {
      return '*'
    }

    if (Array.isArray(values[name])) {
      return values[name].join(',')
    } else if (typeof values[name] === 'object') {
      //Client have {Group: "lan", Identity: ""} etc.
      return flowObjParse(values[name])
    }

    return values[name]
  }

  let body = (
    <VStack space="md">
      <Text noOfLines={2} w="$3/4" size="sm" color="$muted500">
        {description}
      </Text>
      <HStack space="sm" flexWrap="wrap">
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Badge
              key={p.name}
              action="muted"
              variant="outline"
              size="xs"
              py="$0"
            >
              <BadgeText>{displayValueOrParam(card.values, p.name)}</BadgeText>
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

    const fetchOptions = async () => {
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

    useEffect(() => {
      if (card.getOptions) {
        fetchOptions()
      }
    }, [])

    body = (
      <HStack
        flex={1}
        flexWrap="wrap"
        space="sm"
        sx={{
          '@base': { maxWidth: '210px' },
          '@md': { maxWidth: '400px' }
        }}
      >
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Token
              key={p.name}
              label={p.name}
              value={
                card.values && card.values[p.name] !== undefined
                  ? p.name == 'Client' ||
                    p.name == 'Dst' ||
                    p.name == 'OriginalDst'
                    ? flowObjParse(card.values[p.name])
                    : card.values[p.name]
                  : p.name
              }
              options={options[p.name]}
              description={p.description}
              format={p.format}
              size={Object.keys(card.values).length > 10 ? 'xs' : 'xs'}
              onChange={(value) => onChange(p.name, value)}
            />
          ))}
      </HStack>
    )
  }

  const onChange = (name, value) => {
    if (name == 'Dst' || name == 'OriginalDst') {
      if (typeof value == 'object') {
        card.values[name] = value
      } else {
        //convert Dst/OriginalDst
        try {
          let address = new Address4(value)
          card.values[name] = { IP: value }
        } catch (err) {
          card.values[name] = { Domain: value }
        }
      }
    } else {
      card.values[name] = value
    }

    if (props.onChange) {
      props.onChange(card)
    }
  }

  const onDelete = () => {
    if (props.onDelete) {
      props.onDelete(card)
    }
  }

  //only one item - show button

  let moreMenu = (
    <Button action="secondary" variant="link" size="sm" onPress={onDelete}>
      <ButtonIcon as={CloseIcon} />
    </Button>
  )

  return (
    <HStack
      bg="$warmGray50"
      borderWidth="$1"
      borderColor="$coolGray200"
      w="$full"
      minHeight={edit ? 100 : 160}
      space="md"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        _dark: { bg: '$secondary900', borderColor: '$coolGray900' }
      }}
      p={size == 'xs' ? '$2' : '$4'}
      rounded="$md"
      {...props}
    >
      <Box
        height={size == 'xs' ? 30 : 50}
        rounded="full"
        width={size == 'xs' ? 30 : 50}
        justifyContent="center"
        alignItems="center"
      >
        {icon}
      </Box>

      <VStack flex={1} alignContent="center" space={size == 'xs' ? 'xs' : 'sm'}>
        <HStack space="sm" alignItems="center">
          <Text size="sm" color="$muted400">
            {title}
          </Text>
          {edit && description ? (
            <Tooltip
              h={undefined}
              placement="bottom"
              trigger={(triggerProps) => {
                return (
                  <Button action="secondary" variant="link" {...triggerProps}>
                    <ButtonIcon as={InfoIcon} color="$muted400" />
                  </Button>
                )
              }}
            >
              <TooltipContent>
                <TooltipText>{description}</TooltipText>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </HStack>
        {body}
      </VStack>

      {edit ? moreMenu : null}
    </HStack>
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
