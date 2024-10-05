//for smaller view of device, in a list for example
//TODO add other views, popups etc.
import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'

import { HStack, Pressable, Text, VStack } from '@gluestack-ui/themed'

import IconItem from 'components/IconItem'

//TODO make a component of this
const DeviceItem = React.memo(({ item, show, size, ...props }) => {
  const navigate = useNavigate()

  //TODO pass in as props. for now some hardcoded for mobile
  let dShow = ['Style', 'Name', 'MAC', 'RecentIP']

  if (show?.length) {
    dShow = show
  }

  if (size == 'sm') {
    dShow = ['Style', 'Name']
  } else if (size == 'xs') {
    dShow = ['Name']
  }

  if (props.hideMissing && !item) {
    return null
  }

  let textSize = size || 'md'
  let iconSize = size == 'sm' ? 24 : 32

  let showInfo = dShow.includes('RecentIP') || dShow.includes('MAC')

  let content = (
    <HStack space="md" alignItems="center" {...props}>
      {dShow.includes('Style') ? (
        <IconItem
          name={item?.Style?.Icon || 'Laptop'}
          color={item?.Style?.Color}
          size={iconSize}
        />
      ) : null}

      {dShow.includes('Name') ? (
        <Text flex={1} size={textSize} bold={!!item?.Name}>
          {item?.Name || 'N/A'}
        </Text>
      ) : null}

      {showInfo ? (
        <VStack
          flex={3}
          sx={{
            '@md': {
              flexDirection: 'row-reverse',
              gap: '$8',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }}
        >
          {dShow.includes('RecentIP') ? (
            <Text size="md" bold>
              {item?.RecentIP}
            </Text>
          ) : null}
          {dShow.includes('MAC') ? (
            <Text size="sm" color="$muted500">
              {item?.MAC}
            </Text>
          ) : null}
        </VStack>
      ) : null}
    </HStack>
  )

  if (props.noPress || !item?.MAC) {
    return content
  } else {
    return (
      <Pressable
        flex={1}
        onPress={() => navigate(`/admin/devices/${item?.MAC}`)}
      >
        {content}
      </Pressable>
    )
  }
})

DeviceItem.propTypes = {
  item: PropTypes.object.isRequired,
  show: PropTypes.array,
  size: PropTypes.string
}

export default DeviceItem

export { DeviceItem }
