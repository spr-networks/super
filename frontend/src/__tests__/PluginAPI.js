import { APIPlugin } from '../api/Plugin'

describe('plugin management API routes', () => {
  const client = new APIPlugin()

  beforeEach(() => {
    client.get = jest.fn()
    client.put = jest.fn()
    client.delete = jest.fn()
  })

  it('keeps management calls outside the proxied plugin namespace', () => {
    client.list()
    client.add({ Name: 'plugin/name' })
    client.remove({ Name: 'plugin/name' })
    client.restart('plugin/name')
    client.updateContainer('plugin/name')

    expect(client.get).toHaveBeenCalledWith('/plugins_api/')
    expect(client.put).toHaveBeenCalledWith('/plugins_api/plugin%2Fname', {
      Name: 'plugin/name'
    })
    expect(client.delete).toHaveBeenCalledWith('/plugins_api/plugin%2Fname', {
      Name: 'plugin/name'
    })
    expect(client.put).toHaveBeenCalledWith('/plugins_api/plugin%2Fname/restart')
    expect(client.put).toHaveBeenCalledWith(
      '/plugins_api/plugin%2Fname/update_container'
    )
  })
})
