import React, { useContext, useEffect } from 'react'
import PropTypes from 'prop-types'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-dom'

import { useColorMode as useColorModeNB } from 'native-base' //TODONB

import {
  Button,
  ButtonIcon,
  HStack,
  Link,
  LinkText,
  Text,
  MenuIcon,
  MoonIcon,
  SunIcon,
  /*TODO
  Tooltip,
  TooltipContent,
  TooltipText,
  */
  useColorMode
} from '@gluestack-ui/themed'

import { LogOutIcon } from 'lucide-react-native'

import { AppContext } from 'AppContext'

const AdminNavbar = ({
  isMobile,
  isOpenSidebar,
  setIsOpenSidebar,
  version,
  toggleColorMode,
  ...props
}) => {
  const { isMeshNode } = useContext(AppContext)

  const colorMode = useColorMode()
  const toggleColorModeNB = useColorModeNB().toggleColorMode

  const navigate = useNavigate()
  const logout = async () => {
    await AsyncStorage.removeItem('user')
    navigate('/')
  }

  return (
    <>
      <HStack
        w="100%"
        borderBottomWidth={'$1'}
        bg={
          colorMode == 'light'
            ? '$navbarBackgroundLight'
            : '$navbarBackgroundDark'
        }
        borderColor={
          colorMode == 'light'
            ? '$navbarBorderColorLight'
            : '$navbarBorderColorDark'
        }
        px={'$5'}
        h={'$16'}
        justifyContent="space-between"
      >
        <HStack w="100%" alignItems="center" space={'sm'} px={'$2'}>
          <Button
            variant="link"
            onPress={() => setIsOpenSidebar(!isOpenSidebar)}
          >
            <ButtonIcon
              size="xl"
              color={
                colorMode == 'light'
                  ? '$navbarTextColorLight'
                  : '$navbarTextColorDark'
              }
              as={MenuIcon}
            />
          </Button>

          <Text fontSize="lg" bold onPress={() => navigate('/admin/home')}>
            SPR
          </Text>
          {isMeshNode ? <Text fontSize="lg">MESH</Text> : null}

          <Text fontSize="sm" color="muted.600" isTruncated>
            {version}
          </Text>

          <HStack marginLeft="auto" space={'2xl'} alignItems="center">
            <Link
              isExternal
              href="https://www.supernetworks.org/pages/docs/intro"
              sx={{
                '@base': { display: 'none' },
                '@lg': { display: 'flex' },
                _text: {
                  textDecorationLine: 'none',
                  color:
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                }
              }}
            >
              <LinkText size="sm">Docs</LinkText>
            </Link>
            <Link
              fontSize="md"
              isExternal
              href="https://www.supernetworks.org/pages/api/0"
              sx={{
                '@base': { display: 'none' },
                '@lg': { display: 'flex' },
                _text: {
                  textDecorationLine: 'none',
                  color:
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                }
              }}
            >
              <LinkText size="sm">API</LinkText>
            </Link>
            <Button
              onPress={() => {
                toggleColorMode()
                toggleColorModeNB()
              }}
              variant="link"
            >
              <ButtonIcon
                as={colorMode == 'light' ? MoonIcon : SunIcon}
                size="xl"
                color={
                  colorMode == 'light'
                    ? '$navbarTextColorLight'
                    : '$navbarTextColorDark'
                }
              />
            </Button>

            <Button
              variant="link"
              onPress={logout}
              sx={{
                _icon: {
                  color:
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                }
              }}
            >
              <ButtonIcon as={LogOutIcon} size="lg" />
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
  isMobile: PropTypes.bool,
  version: PropTypes.string
}

export default AdminNavbar
