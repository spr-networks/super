import React from 'react'
import PropTypes from 'prop-types'
import { HStack, Link, LinkText, Text } from '@gluestack-ui/themed'

function Footer(props) {
  let color = props.color || '$muted600'
  let _text = props.color
    ? {
        color,
        fontWeight: '300',
        size: 'xs',
        textShadow: '1px 1px 0px #222'
      }
    : {}

  return (
    <HStack
      space="sm"
      p="$4"
      display={{ base: 'none', md: 'flex' }}
      alignItems="center"
      {...props}
    >
      <Link sx={{ _text }} isExternal href="https://www.supernetworks.org/">
        <LinkText>Supernetworks</LinkText>
      </Link>
      <Link
        sx={{ _text }}
        isExternal
        href="https://www.supernetworks.org/pages/blog"
      >
        <LinkText>Blog</LinkText>
      </Link>
      <Link
        sx={{ _text }}
        isExternal
        href="https://www.supernetworks.org/pages/docs/intro"
      >
        <LinkText>Documentation</LinkText>
      </Link>
      <Link
        sx={{ _text }}
        isExternal
        href="https://github.com/spr-networks/super"
      >
        <LinkText>Github</LinkText>
      </Link>

      <Text {..._text} size="md">
        &copy; {1900 + new Date().getYear()} SPR
      </Text>
    </HStack>
  )
}

Footer.propTypes = {
  color: PropTypes.string,
  default: PropTypes.bool,
  fluid: PropTypes.bool
}

export default Footer
