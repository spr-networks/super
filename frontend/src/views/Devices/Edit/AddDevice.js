import React, { useState } from 'react'
import Select from 'react-select'
import TagsInput from 'react-tagsinput'

// reactstrap components
import {
  Label,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  FormGroup,
  FormText,
  Row,
  Col
} from 'reactstrap'

let did_submit = false

const Step1 = React.forwardRef((props, ref) => {
  let prev_mac = ''
  let prev_psk = ''

  const [mac, setmac] = useState('')
  const [psk, setpsk] = useState('')
  const [wpa, setwpa] = useState('sae') //WPA3
  const [name, setname] = useState('')
  const [groups, setGroups] = useState(['dns', 'wan'])

  const [macState, setmacState] = useState('has-success')
  const [pskState, setpskState] = useState('has-success')
  const [wpaState, setwpaState] = useState('has-success')
  const [nameState, setnameState] = useState('')

  let submitted = () => {
    return did_submit
  }
  let setsubmitted = (v) => {
    did_submit = v
  }

  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      if (isValidated()) {
        return true
      }
      return false
    },
    state: {
      mac,
      psk,
      wpa,
      name,
      groups,
      macState,
      pskState,
      wpaState,
      setnameState,
      submitted,
      setsubmitted
    }
  }))

  // function that verifies if a string has a given length or not
  const verifyLength = (value, length) => {
    if (value.length >= length) {
      return true
    }
    return false
  }

  const filterMAC = (value) => {
    //must be of the format 00:00:00:00:00:00
    const hexChars = '0123456789abcdef'
    let digits = ''
    for (let c of value) {
      if (hexChars.indexOf(c) != -1) {
        digits += c
      }
    }
    let mac = ''
    let i = 0
    for (i = 0; i < digits.length - 1 && i < 6 * 2; i += 2) {
      mac += digits[i]
      mac += digits[i + 1]
      mac += ':'
    }
    if (i < digits.length && i < 6 * 2) {
      mac += digits[i]
    }
    if (mac[mac.length - 1] == ':') {
      mac = mac.slice(0, mac.length - 1)
    }
    return mac
  }
  const validateMAC = (value) => {
    //allow blank mac
    if (value == '') {
      return true
    }
    if (value.length == 17) {
      return true
    }
    return false
  }

  const validatePassphrase = (value) => {
    if (value == '') {
      return true
    } else if (value.length >= 8) {
      return true
    }
    return false
  }

  const isValidated = () => {
    if (
      macState === 'has-success' &&
      pskState === 'has-success' &&
      wpaState === 'has-success' &&
      nameState == 'has-success'
    ) {
      return true
    } else {
      if (macState !== 'has-success') {
        setmacState('has-danger')
      }
      if (pskState !== 'has-success') {
        setpskState('has-danger')
      }
      if (wpaState !== 'has-success') {
        setwpaState('has-danger')
      }
      if (nameState !== 'has-success') {
        setnameState('has-danger')
      }
      return false
    }
  }

  const allGroups = [
    { label: 'dns', value: 'dns' },
    { label: 'wan', value: 'wan' },
    { label: 'lan', value: 'lan' }
  ]

  const handleChangeGroups = (newValues) => {
    setGroups(newValues.map((o) => o.value))
  }

  const onChangeInput = (e) => {
    setsubmitted(false)
    if (!verifyLength(e.target.value, 1)) {
      setnameState('has-danger')
    } else {
      setnameState('has-success')
    }
    setname(e.target.value)
  }

  return (
    <>
      <h5 className="info-text">
        Add a new WiFi Device. Wired devices do not need to be added.
      </h5>
      <Row>
        <Col md={{ size: 10, offset: 1 }}>
          <Row>
            <Col md="9">
              <FormGroup className={nameState}>
                <Label for="name">
                  Device Name{' '}
                  {nameState === 'has-danger' ? (
                    <span className="error">cannot be empty</span>
                  ) : (
                    <small>required</small>
                  )}
                </Label>
                <Input
                  name="name"
                  placeholder="Device Name"
                  type="text"
                  autoFocus
                  onChange={onChangeInput}
                  onBlur={onChangeInput}
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label for="name">Auth</Label>
                <Select
                  autosize={false}
                  className="react-select primary"
                  classNamePrefix="react-select"
                  name={wpa}
                  onChange={(value) => {
                    setsubmitted(false)
                    setwpa(value.value)
                  }}
                  options={[
                    {
                      value: 'sae',
                      label: 'WPA3'
                    },
                    { value: 'wpa2', label: 'WPA2' }
                  ]}
                  placeholder="WPA3"
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup className={macState}>
                <Label for="mac">
                  MAC Address{' '}
                  {macState === 'has-danger' ? (
                    <span className="error">format: 00:00:00:00:00:00</span>
                  ) : (
                    <small>optional</small>
                  )}
                </Label>
                <Input
                  name="mac"
                  placeholder=""
                  type="text"
                  onChange={(e) => {
                    setsubmitted(false)
                    e.target.value = filterMAC(e.target.value)
                    if (!validateMAC(e.target.value)) {
                      setmacState('has-danger')
                    } else {
                      setmacState('has-success')
                    }
                    setmac(e.target.value)
                  }}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup className={pskState}>
                <Label for="psk">
                  Passphrase{' '}
                  {pskState === 'has-danger' ? (
                    <span className="error">
                      must be at least 8 characters long
                    </span>
                  ) : (
                    <small>optional</small>
                  )}
                </Label>
                <Input
                  name="psk"
                  placeholder=""
                  type="password"
                  onChange={(e) => {
                    setsubmitted(false)
                    if (!validatePassphrase(e.target.value)) {
                      setpskState('has-danger')
                    } else {
                      setpskState('has-success')
                    }
                    setpsk(e.target.value)
                  }}
                />
              </FormGroup>
            </Col>
          </Row>

          <FormGroup>
            <Label for="groups">
              Groups <small>optional</small>
            </Label>
            <Select
              isMulti
              options={allGroups}
              value={groups.map((v) => {
                return { label: v, value: v }
              })}
              onChange={handleChangeGroups}
            />
            <Label className="info">
              Assign device to groups for network access
            </Label>
          </FormGroup>
        </Col>
      </Row>
    </>
  )
})

export default Step1
