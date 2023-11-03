import React, { useContext, Component } from 'react'
import { Box, View, Heading, Link, Text } from '@gluestack-ui/themed'

export default class PluginDisabled extends Component {
  render() {
    let title = this.props.title || 'Plugin not enabled'

    return (
      <View>
        <Heading size="sm" p="$4">
          {title}
        </Heading>
        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
          p="$4"
        >
          <Text>
            Read more{' '}
            <Link
              isExternal
              href="https://www.supernetworks.org/pages/api/0#section/API-Extensions"
            >
              here
            </Link>{' '}
            on how to activate plugins.
          </Text>
        </Box>
      </View>
    )
  }
}
