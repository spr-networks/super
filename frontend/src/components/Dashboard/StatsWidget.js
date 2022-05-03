import { Component } from 'react'

import { Divider, Box, HStack, Icon, Text } from 'native-base'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

export default class StatsWidget extends Component {
  render() {
    return (
      <Box bg="white" borderRadius="10" mb="4">
        <Box p="5">
          <HStack justifyContent="space-between">
            <Box justifyContent="space-between">
              <Icon
                as={FontAwesomeIcon}
                size="20"
                color={this.props.iconColor || 'warmGray.50'}
                icon={this.props.icon}
              />
            </Box>
            <Box justifyContent="space-between" py="1">
              <Text textAlign="right" fontSize="lg">
                {this.props.title}
              </Text>
              <Text textAlign="right">{this.props.text}</Text>
            </Box>
          </HStack>
        </Box>
        {this.props.textFooter ? (
          <Box>
            <Divider _light={{ bg: 'muted.200' }} />
            <HStack p="2">
              <Text color="warmGray.400" mr="1">
                <i className={this.props.iconFooter} />
              </Text>
              <Text>{this.props.textFooter}</Text>
            </HStack>
          </Box>
        ) : null}
      </Box>
    )
  }
}
