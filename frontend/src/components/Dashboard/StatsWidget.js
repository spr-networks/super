import { Divider, Box, HStack, Text, useColorModeValue } from 'native-base'

import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'

const StatsWidget = (props) => {
  const { title, text, textFooter, icon, iconColor, iconFooter } = props

  return (
    <Box
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      borderRadius={10}
      mb={4}
      shadow={4}
      flex={1}
    >
      <Box px={4} py={4}>
        <HStack justifyContent="space-between">
          <Box justifyContent="space-between" p="2">
            <Icon size={16} color={iconColor || 'warmGray.50'} icon={icon} />
          </Box>
          <Box justifyContent="center">
            <Text
              textAlign="right"
              fontSize="sm"
              fontWeight={300}
              _light={{ color: 'muted.600' }}
              _dark={{ color: 'muted.400' }}
            >
              {title}
            </Text>
            <Text
              textAlign="right"
              fontSize="xl"
              _light={{ color: 'muted.800' }}
              _dark={{ color: 'muted.400' }}
            >
              {text}
            </Text>
          </Box>
        </HStack>
      </Box>
      {textFooter ? (
        <Box>
          <Divider _light={{ bg: 'muted.200' }} />
          <HStack space={2} px={4} py={2} alignContent="center">
            <Icon icon={iconFooter} color="warmGray.500" />
            <Text color="muted.500" fontSize="xs" fontWeight={300}>
              {textFooter}
            </Text>
          </HStack>
        </Box>
      ) : null}
    </Box>
  )
}

export default StatsWidget
