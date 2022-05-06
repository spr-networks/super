import React from 'react'
import ReactWizard from 'react-bootstrap-wizard'

import { Center, View, useColorModeValue } from 'native-base'

// wizard steps
import Step1 from './Edit/AddDevice'
import Step2 from './Edit/WifiConnect'

const steps = [
  {
    stepName: 'WiFi Configuration',
    stepIcon: 'nc-icon nc-settings',
    component: Step1
  },
  {
    stepName: 'Connect Device',
    stepIcon: 'nc-icon nc-tap-01',
    component: Step2
  }
]

// TODO replace ReactWizard

function Wizard() {
  return (
    <View>
      <Center width={['100%', '100%', '4/6']}>
        <ReactWizard
          steps={steps}
          navSteps
          validate
          title="Add Device"
          description="Set up a new device on the network"
          headerTextCenter
          finishButtonClasses="btn-wd"
          nextButtonClasses="btn-wd"
          previousButtonClasses="btn-wd"
        />
      </Center>
    </View>
  )
}

export default Wizard
