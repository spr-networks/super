import React, { useContext, useEffect } from 'react'
import PropTypes from 'prop-types'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-dom'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faArrowRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import {
  Button,
  Box,
  Flex,
  HamburgerIcon,
  HStack,
  IconButton,
  Link,
  Text,
  MoonIcon,
  SunIcon,
  Tooltip,
  useColorMode,
  useColorModeValue,
  useToken
} from 'native-base'

import { AppContext } from 'AppContext'

const AdminNavbar = ({
  isMobile,
  isOpenSidebar,
  setIsOpenSidebar,
  version
}) => {
  const { isMeshNode } = useContext(AppContext)

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

  const navigate = useNavigate()
  const logout = async () => {
    await AsyncStorage.removeItem('user')
    navigate('/')
  }

  return (
    <>
      <HStack
        w="100%"
        borderBottomWidth={1}
        bg={useColorModeValue('navbarBackgroundLight', 'navbarBackgroundDark')}
        borderColor={useColorModeValue(
          'navbarBorderColorLight',
          'navbarBorderColorDark'
        )}
        px={5}
        h={16}
        justifyContent="space-between"
      >
        <HStack w="100%" alignItems="center" space={1}>
          <IconButton
            variant="unstyled"
            icon={<HamburgerIcon />}
            _icon={{
              color: useColorModeValue(
                'navbarTextColorLight',
                'navbarTextColorDark'
              )
            }}
            onPress={() => setIsOpenSidebar(!isOpenSidebar)}
          />

          <Text fontSize="lg" bold>
            SPR
          </Text>
          {isMeshNode ? <Text fontSize="lg">MESH</Text> : null}

          <Text fontSize="sm" color="muted.600" isTruncated>
            {version}
          </Text>

          <HStack marginLeft="auto" space="4">
            <Link
              p={4}
              isExternal
              href="https://www.supernetworks.org/pages/docs/intro"
              _text={{
                textDecorationLine: 'none',
                color: useColorModeValue(
                  'navbarTextColorLight',
                  'navbarTextColorDark'
                )
              }}
              display={{ base: 'none', lg: 'flex' }}
            >
              Docs
            </Link>
            <Link
              p={4}
              fontSize="md"
              isExternal
              href="https://www.supernetworks.org/pages/api/0"
              _text={{
                textDecorationLine: 'none',
                color: useColorModeValue(
                  'navbarTextColorLight',
                  'navbarTextColorDark'
                )
              }}
              display={{ base: 'none', lg: 'flex' }}
            >
              API
            </Link>
            <Tooltip label="Toggle Theme">
              <IconButton
                p="0"
                onPress={() => {
                  toggleColorMode()
                  const date = new Date()
                }}
                variant="unstyled"
                _icon={{
                  size: 5,
                  color: useColorModeValue(
                    'navbarTextColorLight',
                    'navbarTextColorDark'
                  )
                }}
                icon={useColorModeValue(<MoonIcon />, <SunIcon />)}
              />
            </Tooltip>
            <Tooltip label="Logout">
              <IconButton
                variant="unstyled"
                _icon={{
                  size: 5,
                  color: useColorModeValue(
                    'navbarTextColorLight',
                    'navbarTextColorDark'
                  )
                }}
                _text={{
                  color: useColorModeValue(
                    'navbarTextColorLight',
                    'navbarTextColorDark'
                  )
                }}
                icon={<Icon icon={faArrowRightFromBracket} />}
                onPress={logout}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </HStack>
    </>
  )
}

AdminNavbar.propTypes = {
  isOpenSidebar: PropTypes.bool,
  setIsOpenSidebar: PropTypes.func,
  isMobile: PropTypes.bool,
  version: PropTypes.string
}

export default AdminNavbar
