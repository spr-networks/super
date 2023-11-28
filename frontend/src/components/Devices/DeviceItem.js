//for smaller view of device, in a list for example
//TODO add other views, popups etc.
import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { HStack, Text, VStack } from '@gluestack-ui/themed'

import IconItem from 'components/IconItem'

//TODO make a component of this
const DeviceItem = React.memo(({ item, show, size, ...props }) => {
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

  let textSize = size || 'md'
  let iconSize = size == 'sm' ? 24 : 32
  return (
    <HStack space="md" alignItems="center" {...props}>
      {dShow.includes('Style') ? (
        <IconItem
          name={item?.Style?.Icon || 'Laptop'}
          color={item?.Style?.Color}
          size={iconSize}
        />
      ) : null}

      {dShow.includes('Name') ? (
        <Text size={textSize} bold={!!item?.Name} w="$1/3" minWidth="$24">
          {item?.Name || 'N/A'}
        </Text>
      ) : null}
      <VStack
        sx={{
          '@md': {
            flexDirection: 'row-reverse',
            gap: '$8',
            alignItems: 'center'
          }
        }}
      >
        {dShow.includes('RecentIP') ? (
          <Text size="md">{item?.RecentIP}</Text>
        ) : null}
        {dShow.includes('MAC') ? <Text size="sm">{item?.MAC}</Text> : null}
      </VStack>
    </HStack>
  )
})

DeviceItem.propTypes = {
  item: PropTypes.object.isRequired,
  show: PropTypes.array,
  size: PropTypes.string
}

export default DeviceItem

export { DeviceItem }
