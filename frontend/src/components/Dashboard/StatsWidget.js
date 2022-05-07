import {
  Divider,
  Box,
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
      shadow={1}
    >
      <Box p="5">
        <HStack justifyContent="space-between">
          <Box justifyContent="space-between">
            <Icon
              as={FontAwesomeIcon}
              size="20"
              color={props.iconColor || 'warmGray.50'}
              icon={props.icon}
            />
          </Box>
          <Box justifyContent="space-between" py="1">
            <Text textAlign="right" fontSize="lg">
              {props.title}
            </Text>
            <Text textAlign="right">{props.text}</Text>
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
            <Text>{props.textFooter}</Text>
          </HStack>
        </Box>
      ) : null}
    </Box>
  )
}

export default StatsWidget
