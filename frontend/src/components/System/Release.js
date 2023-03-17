import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from 'FontAwesomeUtils'
import { faPen, faRefresh } from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
  useColorModeValue
} from 'native-base'

import { api } from 'api'
import { AlertContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import InputSelect from 'components/InputSelect'

/*

* add link to system info under the plugins page

* set channel, set auto update on/off for core and PLUS
* set specific version/roll back

* notify about new updates available
* check for new updates?
* dont allow downgrade for major. add “im sure” button

*/

const UpdateReleaseInfo = ({ releaseInfo, onSubmit, ...props }) => {
  const [versions, setVersions] = useState([])
  const [CustomChannel, setCustomChannel] = useState('')
  const [CustomVersion, setCustomVersion] = useState('')
  const [verifyMessage, setShowVerifyMessage] = useState('')
  const [verified, setVerified] = useState(false)

  // fetch available releases onLoad
  useEffect(() => {
    if (releaseInfo.CustomVersion) {
      setCustomVersion(releaseInfo.CustomVersion)
    }

    api.get('/releasesAvailable?container=super_base').then((versions) => {
      versions.reverse()
      //NOTE testing
      //versions[0] = '0.2.23'
      //versions.push('0.0.1')
      setVersions(versions.filter((v) => v.match(/^\d+.\d+.\d+(\-\w+)?$/)))
    })
  }, [])

  const checkVersionChange = (currentVersion, newVersion) => {
    if (newVersion.includes('-dev') && !currentVersion.includes('-dev')) {
      return 'Be aware that the dev channel have new, cool features but can also be unstable'
    }

    let latest = versions[0]
    let latestDev = versions.find((v) => v.includes('-dev'))

    // if, latest-dev tag - get the latest version
    if (currentVersion.startsWith('latest')) {
      currentVersion = currentVersion.includes('-dev') ? latestDev : latest
    }

    if (newVersion.startsWith('latest')) {
      newVersion = newVersion.includes('-dev') ? latestDev : latest
    }

    let [newMajor, newMinor, newPatch] = newVersion.split('-')[0].split('.')
    let [currentMajor, currentMinor, currentPatch] = currentVersion
      .split('-')[0]
      .split('.')

    // downgrade
    if (newMajor < currentMajor || newMinor < currentMinor) {
      return `Downgrading between major and minor versions is not supported, tread lightly & backup your configs`
    }

    // upgrade
    if (newMajor > currentMajor || newMinor > currentMinor) {
      return null
      //return 'Upgrade might have breaking changes, be sure you have read the changelog before you proceed'
    }

    /*if (newPatch < currentPatch) {
      return `YU downgraed?!`
    }*/

    return null
  }

  const handleChange = (value) => {
    let notify = checkVersionChange(releaseInfo.Current, value)
    setShowVerifyMessage(notify)

    // version-channel, else its only version
    if (value.includes('-')) {
      let [version, channel] = value.split('-')
      setCustomVersion(version)
      setCustomChannel(`-${channel}`)
    } else {
      setCustomVersion(value)
      setCustomChannel('')
    }
  }

  const handleSubmit = () => {
    //dont close if not verified upgrade might have breaking changes
    if (verifyMessage && verifyMessage.length && !verified) {
      return false
    }

    onSubmit({
      Current: releaseInfo.Current,
      CustomVersion,
      CustomChannel
    })
  }

  return (
    <Stack space={4}>
      <HStack space={4}>
        <FormControl flex={2}>
          <FormControl.Label>Custom Version</FormControl.Label>
          <InputSelect
            options={versions.map((value) => {
              return {
                label: value,
                value
              }
            })}
            value={releaseInfo.Current}
            onChange={handleChange}
            isDisabled
          />
        </FormControl>
      </HStack>

      {verifyMessage && verifyMessage.length ? (
        <HStack space={4}>
          <FormControl flex={2}>
            <Checkbox
              accessibilityLabel="Verified"
              colorScheme="green"
              value={verified}
              isChecked={verified}
              onChange={(enabled) => setVerified(!verified)}
            >
              I know what I'm doing
            </Checkbox>

            <FormControl.HelperText>{verifyMessage}</FormControl.HelperText>
          </FormControl>
        </HStack>
      ) : null}

      <Button color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

const ReleaseInfo = ({ showModal, ...props }) => {
  const context = useContext(AlertContext)

  const [releaseInfo, setReleaseInfo] = useState(null)
  const [show, setShow] = useState(true)

  useEffect(() => {
    api
      .get('/release')
      .then((releaseInfo) => {
        setReleaseInfo(releaseInfo)
      })
      .catch((err) => context.error(err))
  }, [])

  const checkUpdate = () => {
    let current = releaseInfo.Current

    api.get('/releasesAvailable?container=super_base').then((versions) => {
      versions.reverse() // sort by latest first

      let latest = versions[0]
      let latestDev = versions.find((v) => v.includes('-dev'))

      if (current.includes('dev') && current != latestDev) {
        context.info(`Latest dev version is ${latestDev}, current ${current}`)
      } else if (current != latest) {
        context.info(`Latest version is ${latest}, current ${current}`)
      } else {
        context.success(`${version} is the latest version of spr`)
      }
    })
  }

  const renderReleaseInfoRow = (label, value) => {
    return (
      <HStack
        space={2}
        p={4}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        borderBottomColor="borderColorCardLight"
        _dark={{ borderBottomColor: 'borderColorCardDark' }}
        borderBottomWidth={1}
        justifyContent="space-between"
      >
        <Text>{label}</Text>
        <Text color="muted.500">{value}</Text>
      </HStack>
    )
  }

  const refModal = useRef(null)

  const onSubmit = (info) => {
    api
      .put('/release', info)
      .then((result) => {
        //TODO call /update
        /*api.put('/update').then(() => {
          //note: will not reach this
        }).catch(err => context.error(err))
        */

        //close modal
        refModal.current()

        // TODO trigger download in background and notify user when ready
        context.success(
          `Version updated from ${info.Current} to ${info.CustomVersion}${info.CustomChannel}. Restart SPR to trigger update`
        )
      })
      .catch((err) => {
        context.error(err)
      })
  }

  return (
    <Box {...props}>
      <HStack alignItems="center" justifyContent="space-between" p={4}>
        <Heading fontSize="md" onPress={() => setShow(!show)}>
          SPR Release
        </Heading>
        <Button
          ml="auto"
          size="sm"
          variant="ghost"
          colorScheme="blueGray"
          leftIcon={<Icon icon={faRefresh} />}
          onPress={checkUpdate}
        >
          Check for update
        </Button>
        <ModalForm
          title="Set Release Version"
          triggerText="Upgrade"
          triggerIcon={faPen}
          modalRef={refModal}
        >
          <UpdateReleaseInfo releaseInfo={releaseInfo} onSubmit={onSubmit} />
        </ModalForm>
      </HStack>
      {/*NOTE also have .CustomChannel, .CustomVersion*/}
      {releaseInfo ? (
        <>
          {renderReleaseInfoRow('Current Version', releaseInfo.Current)}
          {/*renderReleaseInfoRow('Custom Channel', releaseInfo.CustomChannel)}
          {renderReleaseInfoRow('Custom Version', releaseInfo.CustomVersion)*/}
        </>
      ) : null}
    </Box>
  )
}

export default ReleaseInfo
