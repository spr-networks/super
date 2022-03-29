import React from 'react';
import { render } from '@testing-library/react';
import { testLogin, saveLogin, getDevices, deleteDevice } from "../components/Helpers/Api.js";
import { getDNSConfig } from "../components/Helpers/Api.js";

describe('API Login', () => {

  test('fail login', () => {
    testLogin('admin', 'adminzz', (success) => {
      expect(success).not.toBeTruthy()
    })
  })

  test('login', () => {
    testLogin('admin', 'admin', (success) => {
      expect(success).toBeTruthy()
      saveLogin('admin', 'admin')
    })
  })

})

describe('API Device', () => {

  saveLogin('admin', 'admin')

  test('fetches devices', async () => {
    let devices = await getDevices()
    expect(devices.length).toBeGreaterThan(1)

    let dev = devices[0]
    expect(dev.MAC).toEqual(expect.stringMatching(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/))
  })

  test('deletes a device', async () => {
    let devices = await getDevices()
    let len1 = devices.length
    let dev = devices[0]

    await deleteDevice(dev.MAC)

    devices = await getDevices()
    let len2 = devices.length
    expect(len2).toBe(len1-1)
  })

})

describe('API DNS Plugin', () => {

  saveLogin('admin', 'admin')

  test('fetches config', async () => {
    let config = await getDNSConfig()
    expect(config).toHaveProperty('BlockLists')
    expect(config).toHaveProperty('BlockDomains')
    expect(config).toHaveProperty('PermitDomains')
  })

})
