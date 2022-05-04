import React from 'react'
import { Route, Switch } from 'react-router-dom'

import Footer from 'components/Footer/Footer'
import routes from 'routes'

import { View, Box, useColorModeValue } from 'native-base'

function Pages() {
  const getRoutes = (routes) => {
    return routes.map((prop, key) => {
      if (prop.collapse) {
        return getRoutes(prop.views)
      }
      if (prop.layout === '/auth') {
        return (
          <Route
            path={prop.layout + prop.path}
            component={prop.component}
            key={key}
          />
        )
      } else {
        return null
      }
    })
  }
  return (
    <>
      <Box
        w="100%"
        h={{ base: '100%', md: '100vh' }}
        _light={{ bg: 'coolGray.100' }}
        _dark={{ bg: 'blueGray.900' }}
        p={20}
        alignItems="center"
        nativeID={useColorModeValue(
          'nativebase-body-light',
          'nativebase-body-dark'
        )}
      >
        <Switch>{getRoutes(routes)}</Switch>
        <Box>
          <Footer direction="row" />
        </Box>
      </Box>
    </>
  )
}

export default Pages
