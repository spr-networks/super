import React, { useContext } from 'react'
import { Center, Spinner } from '@gluestack-ui/themed'
import { Navigate } from 'react-router-dom'

import { AppContext } from 'AppContext'

const FeatureFlagRoute = ({ flag, component: Component }) => {
  const { featureFlags, isFeatureFlagsInitialized } =
    useContext(AppContext)

  if (!isFeatureFlagsInitialized) {
    return (
      <Center flex={1} minHeight={240}>
        <Spinner accessibilityLabel="Loading feature flags" />
      </Center>
    )
  }

  if (!(featureFlags || []).includes(flag)) {
    return <Navigate to="/admin/home" replace />
  }

  return <Component />
}

export default FeatureFlagRoute
