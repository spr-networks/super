const agent = require('../agent')
const assert = require('assert')

const { exec } = require('child_process');
/*
Note: these tests should run after 'device.js'
*/

describe('stations', () => {
  it('should connect sta3', (done) => {

    exec('docker exec sta3 ip -br addr | grep 192.168', (err, stdout, stderr) => {
      assert(err == null || err.code == 0, "failed to get an ip")
      done()
     })
   })

})
