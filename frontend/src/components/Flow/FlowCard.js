import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faAddressCard,
  faArrowRight,
  faArrowRightLong,
  faBan,
  faCircleInfo,
  faCirclePlus,
  faClock,
  faEllipsis,
  faPlus,
  faTag,
  faTags,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import {
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
  useColorModeValue
} from 'native-base'
import { isMetaProperty, isTemplateSpan } from 'typescript'

const FlowCard = ({ icon, title, description, size, edit }) => {
  size = size || 'md'

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (
    <Menu w="190" closeOnSelect={true} trigger={trigger}>
      <Menu.Item>Edit</Menu.Item>
      <Menu.Item
        _text={{ color: 'danger.600' }}
        onPress={() => console.log('delete card')}
      >
        Delete
      </Menu.Item>
    </Menu>
  )

  return (
    <Box
      bg={useColorModeValue('muted.50', 'blueGray.700')}
      p={size == 'xs' ? 2 : 4}
      borderRadius={5}
      shadow={5}
      rounded="md"
      minW={340}
      maxWidth="100%"
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
            {/*<Icon icon={faCircleInfo} size="xs" color="muted.200" />*/}
          </HStack>
          <Text>{description}</Text>
        </VStack>
        {edit ? moreMenu : null}
      </HStack>
    </Box>
  )
}

FlowCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.oneOfType([
    PropTypes.string.isRequired,
    PropTypes.element.isRequired
  ]),
  icon: PropTypes.element.isRequired,
  size: PropTypes.string,
  edit: PropTypes.bool
}

// token is like variables but for cards
// TODO use proptypes to describe the cards
const Token = ({ value: defaultValue, label, onChange, ...props }) => {
  const [value, setValue] = useState(defaultValue)

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
    >
      {value}
    </Button>
  )

  return (
    <>
      {label ? <Text mr={1}>{label}</Text> : null}
      <Popover trigger={trigger}>
        <Popover.Content>
          <Popover.Body>
            <HStack space={1}>
              <FormControl flex={1}>
                <Input
                  variant="outlined"
                  defaultValue={value}
                  onChangeText={(value) => setValue(value)}
                />
              </FormControl>
              <IconButton
                ml="auto"
                colorScheme="light"
                icon={<Icon icon={faTag} />}
              />
            </HStack>
          </Popover.Body>
        </Popover.Content>
      </Popover>
    </>
  )
}

const TriggerCardDate = ({ item, edit, ...props }) => {
  return (
    <FlowCard
      title="Date"
      description={
        edit ? (
          <HStack space={1} justifyContent="space-around" alignItems="center">
            <Token
              value={item.days.join(',')}
              onChange={(value) => {
                item.days = value.split(',')
              }}
            />
            <Token
              value={item.from}
              onChange={(value) => {
                item.from = value
              }}
            />
            <Text>-</Text>
            <Token
              value={item.to}
              onChange={(value) => {
                item.to = value
              }}
            />
          </HStack>
        ) : (
          <HStack space={1}>
            <Text>Weekdays</Text>
            <Text>{item.from}</Text>
            <Text>-</Text>
            <Text>{item.to}</Text>
          </HStack>
        )
      }
      icon={
        <Icon
          icon={faClock}
          color="violet.300"
          size={props.size == 'xs' ? '8x' : '12x'}
        />
      }
      {...props}
    />
  )
}

const ActionCardBlock = ({ item, edit, ...props }) => (
  <FlowCard
    title={`Block ${item.Protocol.toUpperCase()}`}
    description={
      edit ? (
        <HStack space={1}>
          <Token label="Source" value={item.SrcIP} />
          <Token label="Dest" value={item.DstIP} />
        </HStack>
      ) : (
        <HStack space={1}>
          <Text>Source</Text>
          <Text bold>{item.SrcIP}</Text>
          <Text>Dest</Text>
          <Text bold>{item.DstIP}</Text>
        </HStack>
      )
    }
    icon={
      <Icon
        icon={faBan}
        color="red.400"
        size={props.size == 'xs' ? '8x' : '12x'}
      />
    }
    {...props}
  />
)

export { FlowCard, Token, TriggerCardDate, ActionCardBlock }
export default FlowCard
