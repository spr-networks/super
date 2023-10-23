import React from 'react'
import {
  Divider,
  Box,
  HStack,
  Icon,
  Text,
  useColorMode
} from '@gluestack-ui/themed'

const StatsWidget = ({
  title,
  text,
  textFooter,
  icon,
  iconColor,
  iconFooter,

  ...props
}) => {
  return (
    <Box
      bg={
        useColorMode() == 'light'
          ? '$backgroundCardLight'
          : '$backgroundCardDark'
      }
      borderRadius={10}
      shadow={4}
      {...props}
    >
      <HStack p="$4" justifyContent="space-between">
        <Box p="$2">
          <Icon as={icon} size={64} color={iconColor || '$warmGray50'} />
        </Box>
        <Box>
          <Text
            textAlign="right"
            size="sm"
            fontWeight={300}
            color={useColorMode() == 'light' ? '$muted800' : '$muted400'}
          >
            {title}
          </Text>
          <Text
            textAlign="right"
            size="xl"
            color={useColorMode() == 'light' ? '$muted800' : '$muted400'}
          >
            {text}
          </Text>
        </Box>
      </HStack>

      {textFooter ? (
        <Box>
          <Divider />
          <HStack space="md" p="$2" px="$4" alignItems="center">
            {/*<Icon icon={iconFooter} color="$warmGray500" />*/}
            <Text color="$muted500" size="xs" fontWeight={300}>
              {textFooter}
            </Text>
          </HStack>
        </Box>
      ) : null}
    </Box>
  )
}

export default StatsWidget
