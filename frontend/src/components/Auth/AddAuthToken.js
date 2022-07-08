import React, { useContext, useState } from 'react'

import { authAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Button, FormControl, Input, Select, Stack } from 'native-base'

const AddAuthToken = (props) => {
  const context = useContext(AlertContext)

  const [Name, setName] = useState('')
  const [Expiration, setExpiration] = useState('')

  const expires = {
    Never: 0,
    '1 hour': 3600,
    '1 day': 24 * 3600,
    '30 days': 30 * 24 * 3600,
    '90 days': 90 * 24 * 3600,
    '1 year': 365 * 24 * 3600
  }

  const handleChange = (name, value) => {
    if (name == 'Name') {
      setName(value)
    }
    if (name == 'Expiration') {
      setExpiration(value)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    let exp = Expiration

    // TODO validate
    if (!Object.keys(expires).includes(exp)) {
      exp = '30 days'
    }

    let ts = parseInt(new Date().getTime() / 1e3)
    let expire = exp == 'Never' ? 0 : ts + expires[exp]

    authAPI
      .putToken(Name, expire)
      .then((token) => {
        props.notifyChange()
      })
      .catch((err) => context.error('' + err))
  }

  return (
    <Stack space={4}>
      <FormControl>
        <FormControl.Label>Name</FormControl.Label>

        <Input
          type="text"
          variant="underlined"
          name="Name"
          value={Name}
          onChangeText={(value) => handleChange('Name', value)}
          autoFocus
        />

        <FormControl.HelperText>
          Use a unique name to identify your plugin
        </FormControl.HelperText>
      </FormControl>

      <FormControl>
        <FormControl.Label>Expiration</FormControl.Label>

        <Select
          selectedValue={Expiration}
          onValueChange={(value) => handleChange('Expiration', value)}
          accessibilityLabel={`Choose Expiration`}
        >
          {Object.keys(expires).map((val) => (
            <Select.Item key={val} label={val} value={val} />
          ))}
        </Select>

      </FormControl>

      <Button color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

export default AddAuthToken
