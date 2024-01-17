import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-dom'

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
  useColorMode,
  Pressable,
  Badge,
  BadgeText
} from '@gluestack-ui/themed'

import { LogOutIcon } from 'lucide-react-native'

import { AppContext } from 'AppContext'

import RouteJump from './RouteJump'

const AdminNavbar = ({
  version,
  isMobile,
  isOpenSidebar,
  setIsOpenSidebar,
  isSimpleMode,
  setIsSimpleMode,
  toggleColorMode,
  ...props
}) => {
  const { isMeshNode, setActiveSidebarItem } = useContext(AppContext)

  const colorMode = useColorMode()
  //const toggleColorModeNB = useColorModeNB().toggleColorMode

  const navigate = useNavigate()
  const logout = async () => {
    await AsyncStorage.removeItem('user')
    navigate('/')
  }

  const niceVersion = (v) => {
    //avoid vxyz if running custom/latest tag
    if (v.match(/^[0-9]/)) {
      return `v${v}`
    }

    return v
  }

  return (
    <>
      <HStack
        w="100%"
        borderBottomWidth="$1"
        borderTopWidth="$1"
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
        px="$3"
        h="$16"
        sx={{
          '@md': { px: '$4' }
        }}
        justifyContent="space-between"
      >
        <HStack w="100%" alignItems="center" space="sm">
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

          <Pressable
            onPress={() => {
              setActiveSidebarItem('home')
              navigate('/admin/home')
            }}
          >
            <HStack space="sm">
              <Text size="lg" bold>
                SPR
              </Text>
              {isMeshNode ? <Text size="lg">MESH</Text> : null}
              <Badge
                variant="outline"
                action="muted"
                bg="$transparent"
                rounded="$2xl"
                size="md"
              >
                <BadgeText color="$muted500" textTransform="none">
                  {niceVersion(version)}
                </BadgeText>
              </Badge>
            </HStack>
          </Pressable>

          <RouteJump />

          <HStack marginLeft="auto" space="2xl" alignItems="center">
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
              size="md"
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
                //toggleColorModeNB()
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
