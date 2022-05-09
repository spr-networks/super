import {
  Divider,
  Box,
  Heading,
  HStack,
  Icon,
  Text,
  useColorModeValue
} from 'native-base'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

const StatsWidget = (props) => {
  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      borderRadius="10"
      mb="4"
      shadow={4}
      flex="1"
    >
      <Box px="4" py="2">
        <HStack justifyContent="space-between">
          <Box justifyContent="space-between" p="2">
            <Icon
              as={FontAwesomeIcon}
              size="20"
              color={props.iconColor || 'warmGray.50'}
              icon={props.icon}
            />
          </Box>
          <Box justifyContent="center">
            <Text
              textAlign="right"
              fontSize="sm"
              fontWeight={300}
              _light={{ color: 'muted.600' }}
              _dark={{ color: 'muted.400' }}
            >
              {props.title}
            </Text>
            <Text
              textAlign="right"
              fontSize="xl"
              _light={{ color: 'muted.800' }}
              _dark={{ color: 'muted.400' }}
            >
              {props.text}
            </Text>
          </Box>
        </HStack>
      </Box>
      {props.textFooter ? (
        <Box>
          <Divider _light={{ bg: 'muted.200' }} />
          <HStack p="2">
            <Text color="warmGray.400" mr="1">
              <i className={props.iconFooter} />
            </Text>
            <Text color="muted.500" fontSize="sm" fontWeight={300}>
              {props.textFooter}
            </Text>
          </HStack>
        </Box>
      ) : null}
    </Box>
  )
}

export default StatsWidget
