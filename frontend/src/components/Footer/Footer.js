import React from 'react'
import PropTypes from 'prop-types'
import { StyleSheet } from 'react-native'
import { Box, Stack, Link, Text } from 'native-base'

function Footer(props) {
  let color = props.color || 'muted.600'
  let _text = {
    color,
    textDecoration: 'none',
    style: styles.text
  }

  return (
    <Stack
      direction="row"
      space={2}
      mt={10}
      display={{ base: 'none', md: 'flex' }}
      justifyContent="center"
      {...props}
    >
      <Link _text={_text} isExternal href="https://www.supernetworks.org/">
        Supernetworks
      </Link>
      <Link
        _text={_text}
        isExternal
        href="https://www.supernetworks.org/pages/blog"
      >
        Blog
      </Link>
      <Link
        _text={_text}
        isExternal
        href="https://www.supernetworks.org/pages/docs/intro"
      >
        Documentation
      </Link>
      <Link
        _text={_text}
        isExternal
        href="https://github.com/spr-networks/super"
      >
        Github
      </Link>

      <Text color={color} style={styles.text} w={100} marginLeft="none">
        &copy; {1900 + new Date().getYear()} SPR
      </Text>
    </Stack>
  )
}

Footer.propTypes = {
  color: PropTypes.string,
  default: PropTypes.bool,
  fluid: PropTypes.bool
}

export default Footer

const styles = StyleSheet.create({
  text: {
    fontWeight: 200,
    textDecoration: 'none',
    textShadow: '1px 1px 0px #222'
  }
})
