import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useHistory } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPowerOff } from '@fortawesome/free-solid-svg-icons'
import {
  Button,
  Box,
  Flex,
  HamburgerIcon,
  HStack,
  Icon,
  IconButton,
  Link,
  Text,
  MoonIcon,
  SunIcon,
  useColorMode,
  useColorModeValue
} from 'native-base'

const AdminNavbar = ({ isOpenSidebar, setIsOpenSidebar }) => {
  const { colorMode, toggleColorMode } = useColorMode()

  /*useEffect(() => {
    if (colorMode === 'light')
      document
        .getElementsByTagName('html')[0]
        .setAttribute('data-theme', 'light')
    else
      document
        .getElementsByTagName('html')[0]
        .setAttribute('data-theme', 'dark')
  }, [colorMode])*/

  const history = useHistory()
  const logout = () => {
    localStorage.removeItem('user')
    history.push('/')
  }

  return (
    <>
      <HStack
        w="100%"
        borderBottomWidth="1"
        _light={{ borderColor: 'coolGray.200' }}
        _dark={{ borderColor: 'coolGray.800' }}
        px="5"
        h="16"
        justifyContent="space-between"
      >
        <HStack w="100%" alignItems="center" space="1">
          <IconButton
            icon={<HamburgerIcon />}
            _icon={{ color: useColorModeValue('coolGray.600', 'coolGray.300') }}
            onPress={() => setIsOpenSidebar(!isOpenSidebar)}
          />

          <Text fontSize="lg" bold>
            SPR
          </Text>

          <Text fontSize="md" color="muted.600">
            v1.4
          </Text>

          <HStack marginLeft="auto" space="4">
            <Link
              p={4}
              isExternal
              href="https://www.supernetworks.org/pages/docs/intro"
              _text={{
                textDecorationLine: 'none'
              }}
              display={{ base: 'none', lg: 'flex' }}
            >
              Docs
            </Link>
            <Link
              p={4}
              fontSize="md"
              isExternal
              href="https://www.supernetworks.org/pages/docs/api/0"
              _text={{
                textDecorationLine: 'none'
              }}
              display={{ base: 'none', lg: 'flex' }}
            >
              API
            </Link>
            <IconButton
              p="0"
              onPress={() => {
                toggleColorMode()
                const date = new Date()
              }}
              variant="unstyled"
              _icon={{
                size: '6',
                _light: { color: 'coolGray.600' },
                _dark: { color: 'coolGray.300' }
              }}
              icon={useColorModeValue(<MoonIcon />, <SunIcon />)}
            />
            <Button
              variant="outline"
              leftIcon={<Icon as={FontAwesomeIcon} icon={faPowerOff} />}
              onPress={logout}
            >
              Log out
            </Button>
          </HStack>
        </HStack>
      </HStack>
    </>
  )
}

AdminNavbar.propTypes = {
  isOpenSidebar: PropTypes.bool,
  setIsOpenSidebar: PropTypes.func,
  isMobile: PropTypes.bool
}

export default AdminNavbar
