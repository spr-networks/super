//for smaller view of device, in a list for example
//TODO add other views, popups etc.
import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { HStack, Text, VStack } from '@gluestack-ui/themed'

import IconItem from 'components/IconItem'

//TODO make a component of this
const DeviceItem = React.memo(({ item, ...props }) => {
  //TODO pass in as props. for now some hardcoded for mobile
  let show = ['Style', 'Name', 'MAC', 'RecentIP']

  return (
    <HStack space="md" alignItems="center" {...props}>
      {show.includes('Style') ? (
        <IconItem
          name={item?.Style?.Icon || 'Laptop'}
          color={item?.Style?.Color}
          size={32}
        />
      ) : null}

      {show.includes('Name') ? (
        <Text size="md" bold={!!item?.Name} w="$1/3" minWidth="$24">
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
        {show.includes('RecentIP') ? (
          <Text size="md">{item?.RecentIP}</Text>
        ) : null}
        {show.includes('MAC') ? <Text size="sm">{item?.MAC}</Text> : null}
      </VStack>
    </HStack>
  )
})

DeviceItem.propTypes = {
  item: PropTypes.object.isRequired
}

export default DeviceItem

export { DeviceItem }
