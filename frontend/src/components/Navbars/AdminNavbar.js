import React, { useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPowerOff } from '@fortawesome/free-solid-svg-icons'
import {
  Button,
  Box,
  Flex,
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

/*
function AdminNavbarOld(props) {
  const [collapseOpen, setCollapseOpen] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [color, setColor] = React.useState('navbar-transparent')
  const location = useLocation()
  React.useEffect(() => {
    window.addEventListener('resize', updateColor)
  })
  React.useEffect(() => {
    if (
      window.outerWidth < 993 &&
      document.documentElement.className.indexOf('nav-open') !== -1
    ) {
      document.documentElement.classList.toggle('nav-open')
    }
  }, [location])
  // function that adds color white/transparent to the navbar on resize (this is for the collapse)
  const updateColor = () => {
    if (window.innerWidth < 993 && collapseOpen) {
      setColor('bg-white')
    } else {
      setColor('navbar-transparent')
    }
  }
  // this function opens and closes the sidebar on small devices
  const toggleSidebar = () => {
    document.documentElement.classList.toggle('nav-open')
    setSidebarOpen(!sidebarOpen)
  }
  // this function opens and closes the collapse on small devices
  // it also adds navbar-transparent class to the navbar when closed
  // ad bg-white when opened
  const toggleCollapse = () => {
    if (!collapseOpen) {
      setColor('bg-white')
    } else {
      setColor('navbar-transparent')
    }
    setCollapseOpen(!collapseOpen)
  }
  return (
    <>
      <Navbar
        className={classnames('navbar-absolute fixed-top', color)}
        expand="lg"
      >
        <Container fluid>
          <div className="navbar-wrapper">
            <div className="navbar-minimize">
              <Button
                className="btn-icon btn-round"
                color="default"
                id="minimizeSidebar"
                onClick={props.handleMiniClick}
              >
                <i className="nc-icon nc-minimal-right text-center visible-on-sidebar-mini" />
                <i className="nc-icon nc-minimal-left text-center visible-on-sidebar-regular" />
              </Button>
            </div>
            <div
              className={classnames('navbar-toggle', {
                toggled: sidebarOpen
              })}
            >
              <button
                className="navbar-toggler"
                type="button"
                onClick={toggleSidebar}
              >
                <span className="navbar-toggler-bar bar1" />
                <span className="navbar-toggler-bar bar2" />
                <span className="navbar-toggler-bar bar3" />
              </button>
            </div>
            <NavbarBrand href="#spr" onClick={(e) => e.preventDefault()}>
              <span className="d-none d-md-block">SPR Admin</span>
              <span className="d-block d-md-none">SPR Admin</span>
            </NavbarBrand>
          </div>
          <button
            aria-controls="navigation-index"
            aria-expanded={collapseOpen}
            aria-label="Toggle navigation"
            className="navbar-toggler"
            // data-target="#navigation"
            data-toggle="collapse"
            type="button"
            onClick={toggleCollapse}
          >
            <span className="navbar-toggler-bar navbar-kebab" />
            <span className="navbar-toggler-bar navbar-kebab" />
            <span className="navbar-toggler-bar navbar-kebab" />
          </button>
          <Collapse
            className="justify-content-end"
            navbar
            isOpen={collapseOpen}
          >
            <Nav navbar>
              <NavItem>
                <NavLink
                  className="btn btn-outline-default btn-sm"
                  href="/"
                  onClick={(e) => localStorage.removeItem('user')}
                >
                  <i className="nc-icon nc-button-power"></i>
                  Log out
                </NavLink>
              </NavItem>
            </Nav>
          </Collapse>
        </Container>
      </Navbar>
    </>
  )
}
*/

const AdminNavbar = (props) => {
  const { colorMode, toggleColorMode } = useColorMode()

  useEffect(() => {
    if (colorMode === 'light')
      document
        .getElementsByTagName('html')[0]
        .setAttribute('data-theme', 'light')
    else
      document
        .getElementsByTagName('html')[0]
        .setAttribute('data-theme', 'dark')
  }, [colorMode])

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
        px="6"
        h="16"
        justifyContent="space-between"
      >
        <HStack w="100%" alignItems="center">
          <Text fontSize="lg" bold>
            SPR
          </Text>
          <Text fontSize="md" color="muted.600" pl="1">
            v1.4
          </Text>
          <HStack marginLeft="auto" space="4">
            <Link
              p={2}
              isExternal
              href="https://www.supernetworks.org/pages/docs/intro"
              _text={{
                textDecorationLine: 'none'
              }}
            >
              Docs
            </Link>
            <Link
              p={2}
              fontSize="md"
              isExternal
              href="https://www.supernetworks.org/pages/docs/api/0"
              _text={{
                textDecorationLine: 'none'
              }}
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

export default AdminNavbar
