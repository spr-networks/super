import React from 'react'
import PropTypes from 'prop-types'

import { Box, Stack, Link, Text } from 'native-base'

function Footer(props) {
  return (
    <Stack
      direction="row"
      space="2"
      w="100%"
      mt="20"
      display={{ base: 'none', md: 'flex' }}
      justifyContent="center"
    >
      <Link isExternal href="https://www.supernetworks.org/">
        Supernetworks
      </Link>
      <Link isExternal href="https://www.supernetworks.org/pages/blog">
        Blog
      </Link>
      <Link isExternal href="https://www.supernetworks.org/pages/docs/intro">
        Documentation
      </Link>
      <Link isExternal href="https://github.com/spr-networks/super">
        Github
      </Link>

      <Text w={100} marginLeft="none">
        &copy; {1900 + new Date().getYear()} SPR
      </Text>
    </Stack>
  )
}

Footer.propTypes = {
  default: PropTypes.bool,
  fluid: PropTypes.bool
}

export default Footer
