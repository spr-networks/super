import React from 'react'
import { Text } from '@gluestack-ui/themed'
import {
  MemoryRouter,
  Route,
  Routes
} from 'react-router-dom'

import { AppContext } from 'AppContext'
import FeatureFlagRoute from 'components/FeatureFlagRoute'
import {
  filterRoutesByFeatureFlags,
  routes
} from 'routes'
import { render, screen } from 'test-utils'

const assistantRoute = (routeList) =>
  routeList.find(({ path }) => path === 'assistant')

const FlaggedPage = () => <Text>Flagged Assistant page</Text>
const HomePage = () => <Text>Home page</Text>

const renderGuard = ({
  featureFlags,
  isFeatureFlagsInitialized = true
}) =>
  render(
    <AppContext.Provider
      value={{ featureFlags, isFeatureFlagsInitialized }}
    >
      <MemoryRouter initialEntries={['/admin/assistant']}>
        <Routes>
          <Route path="/admin/home" element={<HomePage />} />
          <Route
            path="/admin/assistant"
            element={
              <FeatureFlagRoute
                flag="webllm"
                component={FlaggedPage}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </AppContext.Provider>
  )

test('hides the Assistant navigation route unless webllm is enabled', () => {
  expect(assistantRoute(filterRoutesByFeatureFlags(routes, []))).toBeUndefined()
  expect(
    assistantRoute(filterRoutesByFeatureFlags(routes, ['webllm']))
  ).toEqual(expect.objectContaining({ featureFlag: 'webllm' }))
})

test('blocks direct Assistant access while feature flags load', () => {
  renderGuard({
    featureFlags: [],
    isFeatureFlagsInitialized: false
  })

  expect(screen.queryByText('Flagged Assistant page')).toBeNull()
  expect(screen.queryByText('Home page')).toBeNull()
})

test('redirects direct Assistant access when webllm is disabled', () => {
  renderGuard({ featureFlags: [] })

  expect(screen.getByText('Home page')).toBeTruthy()
  expect(screen.queryByText('Flagged Assistant page')).toBeNull()
})

test('renders direct Assistant access when webllm is enabled', () => {
  renderGuard({ featureFlags: ['webllm'] })

  expect(screen.getByText('Flagged Assistant page')).toBeTruthy()
})
