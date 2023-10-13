import React from 'react'
import PluginList from 'components/Plugins/PluginList'
import { ScrollView } from '@gluestack-ui/themed'

const Plugins = (props) => {
  return (
    <ScrollView sx={{ '@md': { h: '90vh' } }}>
      <PluginList />
    </ScrollView>
  )
}

export default Plugins
