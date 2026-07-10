import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-dom'
import { api } from 'api'

import {
  Badge,
  BadgeIcon,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  HStack,
  Icon,
  Link,
  LinkText,
  Text,
  Menu,
  MenuItem,
  MenuItemLabel,
  MenuIcon,
  VStack,
  useColorMode,
  Pressable
} from '@gluestack-ui/themed'

import {
  BookOpenText,
  AlertCircleIcon,
  LogOutIcon,
  PaletteIcon,
  CheckIcon
} from 'lucide-react-native'

import { AppContext } from 'AppContext'
import { themeList, themeKeyFor } from 'Themes'

import RouteJump from './RouteJump'

const AdminNavbar = ({
  version,
  isMobile,
  isOpenSidebar,
  setIsOpenSidebar,
  isSimpleMode,
  setIsSimpleMode,
  theme,
  setTheme,
  customThemes,
  ...props
}) => {
  const { isMeshNode, setActiveSidebarItem } = useContext(AppContext)
  const [versionStatus, setVersionStatus] = useState('')

  const colorMode = useColorMode()

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

  const computeVersionStatus = (versions) => {
    let sorted = [...(versions || [])].reverse() // sort by latest first
    let latest = sorted.find((v) => !v.includes('-dev'))
    let latestDev = sorted.find((v) => v.includes('-dev'))

    let current = version
    //tags like latest / latest-dev / custom builds can't be compared to a
    //semver list; only flag versions that are actual version numbers
    if (
      current.match(/^\d/) &&
      current != latest &&
      current != latestDev
    ) {
      setVersionStatus('Mismatch')
    } else {
      setVersionStatus('')
    }
  }

  const checkUpdate = async () => {
    const now = new Date().getTime()

    try {
      let cached = JSON.parse(await AsyncStorage.getItem('releasesAvailable'))
      if (cached?.versions && now - cached.time < 3600000) {
        computeVersionStatus(cached.versions)
        return
      }
    } catch (e) {}

    api
      .get('/releasesAvailable?container=super_base')
      .then((versions) => {
        AsyncStorage.setItem(
          'releasesAvailable',
          JSON.stringify({ time: now, versions })
        )
        computeVersionStatus(versions)
      })
      .catch((err) => {})
  }

  useEffect(() => {
    if (version == 'default') {
      return
    }

    api
      .getCheckUpdates()
      .then((state) => {
        if (state == true) {
          checkUpdate()
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
                <Text
                  size="lg"
                  bold
                  color={
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                  }
                >
                  SPR
                </Text>
                {isMeshNode ? (
                  <Text
                    size="lg"
                    color={
                      colorMode == 'light'
                        ? '$navbarTextColorLight'
                        : '$navbarTextColorDark'
                    }
                  >
                    MESH
                  </Text>
                ) : null}
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
                <BadgeText
                  textTransform="none"
                  color={
                    versionStatus !== ''
                      ? colorMode == 'light'
                        ? '$amber600'
                        : '$amber400'
                      : colorMode == 'light'
                        ? '$navbarTextColorLight'
                        : '$navbarTextColorDark'
                  }
                >
                  {niceVersion(version)}
                </BadgeText>

                {versionStatus !== '' && (
                  <BadgeIcon
                    as={AlertCircleIcon}
                    ml="$1"
                    color={colorMode == 'light' ? '$amber600' : '$amber400'}
                  />
                )}
              </Badge>
            </Pressable>
          </HStack>

          <RouteJump />

          <HStack marginLeft="auto" space="2xl" alignItems="center">
            {setTheme ? (
              <Menu
                placement="bottom right"
                selectionMode="single"
                selectedKeys={theme ? [themeKeyFor(theme, colorMode)] : []}
                onSelectionChange={(e) => {
                  let key = e.currentKey
                  if (key == '__customize') {
                    navigate('/admin/theme')
                  } else if (key) {
                    let [id, mode] = key.split(':')
                    setTheme(id, mode)
                  }
                }}
                trigger={(triggerProps) => (
                  <Button variant="link" {...triggerProps}>
                    <ButtonIcon
                      as={PaletteIcon}
                      size="lg"
                      color={
                        colorMode == 'light'
                          ? '$navbarTextColorLight'
                          : '$navbarTextColorDark'
                      }
                    />
                  </Button>
                )}
              >
                {themeList.map((t) => (
                  <MenuItem key={t.key} textValue={t.key}>
                    <Box
                      w={16}
                      h={16}
                      rounded="$full"
                      bg={t.swatch?.bg}
                      borderWidth={1}
                      borderColor="$borderColorCardDark"
                      alignItems="center"
                      justifyContent="center"
                      mr="$2"
                    >
                      <Box w={7} h={7} rounded="$full" bg={t.swatch?.accent} />
                    </Box>
                    <MenuItemLabel size="sm">{t.name}</MenuItemLabel>
                    {themeKeyFor(theme, colorMode) == t.key ? (
                      <Icon as={CheckIcon} size="sm" ml="$2" />
                    ) : null}
                  </MenuItem>
                ))}
                {Object.values(customThemes || {}).map((t) => (
                  <MenuItem key={t.id || t.name} textValue={t.id || t.name}>
                    <Box
                      w={16}
                      h={16}
                      rounded="$full"
                      bg={t.swatch?.bg}
                      borderWidth={1}
                      borderColor="$borderColorCardDark"
                      alignItems="center"
                      justifyContent="center"
                      mr="$2"
                    >
                      <Box w={7} h={7} rounded="$full" bg={t.swatch?.accent} />
                    </Box>
                    <MenuItemLabel size="sm">{t.name}</MenuItemLabel>
                    {theme == t.id ? (
                      <Icon as={CheckIcon} size="sm" ml="$2" />
                    ) : null}
                  </MenuItem>
                ))}
                <MenuItem key="__customize" textValue="Customize">
                  <Icon as={PaletteIcon} size="sm" mr="$2" />
                  <MenuItemLabel size="sm">Customize…</MenuItemLabel>
                </MenuItem>
              </Menu>
            ) : null}

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
