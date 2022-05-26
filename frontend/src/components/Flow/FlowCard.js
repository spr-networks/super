import React from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import { faEllipsis } from '@fortawesome/free-solid-svg-icons'

import { Box, IconButton, HStack, VStack, Menu, Text } from 'native-base'

// TODO sz=sm/xs/

const FlowCard = ({ icon, title, description, size }) => {
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
      bg="muted.50"
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
        {moreMenu}
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
  size: PropTypes.string
}

export default FlowCard
