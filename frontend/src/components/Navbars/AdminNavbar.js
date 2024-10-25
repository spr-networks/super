import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-dom'
import { api } from 'api'

import {
  Badge,
  BadgeIcon,
  BadgeText,
  Button,
  ButtonIcon,
  HStack,
  Link,
  LinkText,
  Text,
  MenuIcon,
  MoonIcon,
  SunIcon,
  VStack,
  useColorMode,
  Pressable
} from '@gluestack-ui/themed'

import { BookOpenText, AlertCircleIcon, LogOutIcon } from 'lucide-react-native'

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
  const [versionStatus, setVersionStatus] = useState('')

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

  const checkUpdate = () => {
    api
      .get('/releasesAvailable?container=super_base')
      .then((versions) => {
        versions?.reverse() // sort by latest first
        let latest = versions.find((v) => !v.includes('-dev'))
        let latestDev = versions.find((v) => v.includes('-dev'))

        let current = version
        // if latest get version
        //if (current.startsWith('latest')) {
        //  current = current.includes('-dev') ? latestDev : latest
        //
        if (current != 'default' && current != latest && current != latestDev) {
          setVersionStatus('Mismatch')
        } else {
          setVersionStatus('')
        }
      })
      .catch((err) => {})
      .finally(() => {})
  }

  useEffect(() => {
    api
      .getCheckUpdates()
      .then((state) => {
        const lastCheckTime = localStorage.getItem('lastUpdateCheckTime')

        const currentTime = new Date().getTime()

        if (
          state == true &&
          (!lastCheckTime || currentTime - lastCheckTime >= 3600000)
        ) {
          checkUpdate()

          localStorage.setItem('lastUpdateCheckTime', currentTime)
        }
      })
      .catch((err) => {})
  }, [version])

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

          <HStack space="sm" alignItems="center">
            <Pressable
              onPress={() => {
                setActiveSidebarItem('home')
                navigate('/admin/home')
              }}
            >
              <HStack>
                <Text size="lg" bold>
                  SPR
                </Text>
                {isMeshNode ? <Text size="lg">MESH</Text> : null}
              </HStack>
            </Pressable>

            <Pressable key={'version'} onPress={() => navigate('/admin/info')}>
              <Badge
                variant="outline"
                action={versionStatus == '' ? 'muted' : 'warning'}
                bg="$transparent"
                rounded="$2xl"
                size="md"
                py="$1"
              >
                <BadgeText textTransform="none">
                  {niceVersion(version)}
                </BadgeText>

                {versionStatus !== '' && (
                  <BadgeIcon as={AlertCircleIcon} ml="$1" />
                )}
              </Badge>
            </Pressable>
          </HStack>

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
              <ButtonIcon as={BookOpenText} size="lg" />
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
