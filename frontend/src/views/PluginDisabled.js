import React, { useContext, Component } from 'react'
import { View, Heading, Link, Text, VStack } from 'native-base'

export default class PluginDisabled extends Component {
  render() {
    let title = this.props.title || 'Plugin not enabled'

    return (
      <View>
        <Box
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          rounded="md"
          width="100%"
          p="4"
        >
          <Heading>{title}</Heading>
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
