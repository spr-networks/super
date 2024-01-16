import React from 'react'
import {
  Divider,
  Box,
  HStack,
  Icon,
  Text,
  useColorMode,
  VStack
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
      {...props}
    >
      <HStack p="$4" justifyContent="space-between" alignItems="center">
        <Box p="$2">
          <Icon as={icon} size={64} color={iconColor || '$warmGray50'} />
        </Box>
        {props.children ? (
          <>{props.children}</>
        ) : (
          <VStack space="xs">
            <Text
              textAlign="right"
              size="sm"
              fontWeight={300}
              color="$muted800"
              sx={{ _dark: { color: '$muted400' } }}
            >
              {title}
            </Text>
            <Text
              textAlign="right"
              size="xl"
              color="$muted800"
              sx={{ _dark: { color: '$muted400' } }}
            >
              {text}
            </Text>
          </VStack>
        )}
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
