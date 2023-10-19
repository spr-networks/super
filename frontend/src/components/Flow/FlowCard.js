import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { Icon as IconFA } from 'FontAwesomeUtils'
import { BrandIcons } from 'FontAwesomeUtils'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  HStack,
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
      <IconFA
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
    <VStack space="md">
      <Text noOfLines={2} w="$2/3" size="sm" color="$muted500">
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
                  ? p.name == 'Client'
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

  const trigger = (triggerProps) => (
    <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
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

  let moreMenu = (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'delete') {
          onDelete()
        }
      }}
    >
      <MenuItem key="delete" textValue="delete">
        <TrashIcon color="$red700" ml="$2" />
        <MenuItemLabel size="sm" color="$red700">
          Delete
        </MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  //only one item - show button
  moreMenu = (
    <Button action="secondary" variant="link" size="sm" onPress={onDelete}>
      <ButtonIcon as={CloseIcon} />
    </Button>
  )

  return (
    <Box
      bg="$light"
      borderWidth="$1"
      borderColor="$coolGray200"
      sx={{
        _dark: { bg: '$backgroundContentDark', borderColor: '$coolGray900' },
        '@md': { shadow: 5 }
      }}
      p={size == 'xs' ? '$2' : '$4'}
      rounded="$md"
      minW={320}
      mr="$2"
      {...props}
    >
      <HStack justifyContent="space-between" alignItems="center" space="md">
        <Box
          height={size == 'xs' ? 30 : 50}
          rounded="full"
          width={size == 'xs' ? 30 : 50}
          justifyContent="center"
          alignItems="center"
        >
          {icon}
        </Box>

        <VStack
          flex={1}
          alignContent="center"
          space={size == 'xs' ? 'xs' : 'sm'}
        >
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
