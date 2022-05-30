import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faBan,
  faBroadcastTower,
  faCircleInfo,
  faClock,
  faEllipsis,
  faTag
} from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Box,
  Button,
  IconButton,
  FormControl,
  Input,
  HStack,
  VStack,
  Menu,
  Popover,
  Text,
  Tooltip,
  useColorModeValue
} from 'native-base'

import { getCard } from './FlowCards'

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
    <HStack space={1}>
      {card.params
        .filter((p) => !p.hidden)
        .map((p) => (
          <Badge
            key={p.name}
            variant="outline"
            colorScheme="primary"
            rounded="md"
            size="xs"
            py={0}
          >
            {(card.values && card.values[p.name]) || p.name}
          </Badge>
        ))}
    </HStack>
  )

  if (edit) {
    if (card.values === undefined) {
      card.values = {}
    }

    body = (
      <HStack space={2}>
        {card.params
          .filter((p) => !p.hidden)
          .map((p) => (
            <Token
              key={p.name}
              value={card.values ? card.values[p.name] || p.name : p.name}
              description={p.description}
              format={p.format}
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
    <Menu w="190" p={0} closeOnSelect={true} trigger={trigger}>
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
      minW={320}
      mr={2}
      maxWidth="100%"
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
            {description ? (
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
          <Text>{body}</Text>
        </VStack>
        {edit ? moreMenu : null}
      </HStack>
    </Box>
  )
}

// token is like variables but for cards
// TODO use proptypes to describe the cards
const Token = ({
  value: defaultValue,
  format,
  description,
  onChange,
  ...props
}) => {
  const [value, setValue] = useState(defaultValue)
  const [isOpen, setIsOpen] = useState(false)

  const trigger = (triggerProps) => (
    <Button
      variant="outline"
      colorScheme="light"
      rounded="md"
      size="sm"
      p={1}
      lineHeight={14}
      textAlign="center"
      {...triggerProps}
      onPress={() => setIsOpen(!isOpen)}
    >
      {value}
    </Button>
  )

  const onChangeText = (value) => {
    //only update if correct format
    if (format !== undefined && !value.match(format)) {
      return
    }

    setValue(value)
    if (onChange) {
      onChange(value)
    }
  }

  return (
    <>
      <Popover
        position="auto"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
      >
        <Popover.Content>
          <Popover.Body>
            <HStack space={1}>
              <FormControl flex={1}>
                <Input
                  variant="outlined"
                  defaultValue={value}
                  onChangeText={onChangeText}
                  onSubmitEditing={() => setIsOpen(false)}
                />
                <FormControl.HelperText>{description}</FormControl.HelperText>
              </FormControl>
              {/*<IconButton
                ml="auto"
                colorScheme="light"
                icon={<Icon icon={faTag} />}
              />*/}
            </HStack>
          </Popover.Body>
        </Popover.Content>
      </Popover>
    </>
  )
}

const NewCard = ({ title, cardType, values, ...props }) => {
  let card = getCard(title)
  if (!card) {
    return
  }

  let newCard = JSON.parse(JSON.stringify(card))

  newCard.values = Object.assign(newCard.values || {}, values)
  return newCard
}

FlowCard.propTypes = {
  card: PropTypes.object.isRequired,
  size: PropTypes.string,
  edit: PropTypes.bool,
  onChange: PropTypes.func
}

Token.propTypes = {
  value: PropTypes.any,
  format: PropTypes.instanceOf(RegExp),
  onChange: PropTypes.func
}

export { FlowCard, NewCard, Token }
export default FlowCard
