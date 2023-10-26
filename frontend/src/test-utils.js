import React from 'react'
import { render } from '@testing-library/react-native'
import { GluestackUIProvider } from '@gluestack-ui/themed'
import { config } from 'gluestack-ui.config'

const AllTheProviders = ({ children }) => {
  return (
    <GluestackUIProvider config={config} colorMode="light">
      {children}
    </GluestackUIProvider>
  )
}

const customRender = (ui, options) =>
  render(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react-native'

// override render method
export { customRender as render }
