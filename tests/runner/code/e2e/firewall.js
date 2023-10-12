const agent = require('../agent')
const assert = require('assert')
const {exec, spawn} = require('child_process')

describe('get firewall configuration', () => {
  it('should get status', (done) => {
    agent
      .get('/firewall/config')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert(Object.keys(res.body).length > 0, 'missing firewall configuration')
        done()
      })
  })
})


describe('open router ports', () => {

  it('should open 4040 to lan but not wan', function(done) {
    this.timeout(5000)

    agent
      .put('/firewall/service_port')
      .send({Port: "4040", Protocol: "tcp", UpstreamEnabled: false})
      .expect(200)
      .end((err, res) => {
        assert(res.status == 200)

        let dataString = "SPR Planet"

        var outBuf = ""
        const server = spawn('/bin/bash', ['-c', 'docker exec superbase bash -c "timeout 10 nc -w 1 -l -p 4040"'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'inherit']
        })

        server.stdout.on('data', (data) => {
          outBuf += data
        })

        exec('docker exec superbase ip a l eth0 | awk \'/inet/ {print $2}\' | cut -d/ -f1', (error, stdout, stderr) => {
          let upstream_ip = stdout.trim()
          assert(upstream_ip.length != 0)

          //ensure connection fails
          exec('nc -w 1 ' + upstream_ip + ' 4040', (error, stdout, stderr) => {
            assert(error != null)
            assert(error.code == 1)

            exec('docker exec sta1 bash -c "sleep 0.1; echo ' + dataString + ' | nc -w 2 192.168.100.1 4040"', (error, stdout, stderr) => {
              assert(error == null)
              assert(outBuf.trim() == dataString.trim())
              done()
            })
          })

        })
      })
  })

  it('should open 4040 to wan and lan', function(done) {
    this.timeout(5000)

    agent
      .put('/firewall/service_port')
      .send({Port: "4040", Protocol: "tcp", UpstreamEnabled: true})
      .expect(200)
      .end((err, res) => {
        assert(res.status == 200)


        let dataString = "SPR Planet"

        var outBuf = ""
        const server = spawn('/bin/bash', ['-c', 'docker exec superbase bash -c "timeout 10 nc -w 1 -l -p 4040;  timeout 10 nc -w 1 -l -p 4040"'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'inherit']
        })

        server.stdout.on('data', (data) => {
          outBuf += data
        })

        exec('docker exec superbase ip a l eth0 | awk \'/inet/ {print $2}\' | cut -d/ -f1', (error, stdout, stderr) => {
          let upstream_ip = stdout.trim()
          assert(upstream_ip.length != 0)

          //ensure connection fails
          exec('echo asdf | nc -w 1 ' + upstream_ip + ' 4040', (error, stdout, stderr) => {
            assert(error == null)

            outBuf = ""
            exec('docker exec sta1 bash -c "sleep 0.1; echo ' + dataString + ' | nc -w 2 192.168.100.1 4040"', (error, stdout, stderr) => {
              assert(error == null)
              assert(outBuf.trim() == dataString.trim())
              done()
            })
          })

        })


      })
  })


  it('should open 4040 to lan only again', function(done) {
    this.timeout(5000)
    agent
      .put('/firewall/service_port')
      .send({Port: "4040", Protocol: "tcp", UpstreamEnabled: false})
      .expect(200)
      .end((err, res) => {
        assert(res.status == 200)

        let dataString = "SPR Planet"

        var outBuf = ""
        const server = spawn('/bin/bash', ['-c', 'docker exec superbase bash -c "timeout 10 nc -w 1 -l -p 4040"'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'inherit']
        })

        server.stdout.on('data', (data) => {
          outBuf += data
        })

        exec('docker exec superbase ip a l eth0 | awk \'/inet/ {print $2}\' | cut -d/ -f1', (error, stdout, stderr) => {
          let upstream_ip = stdout.trim()
          assert(upstream_ip.length != 0)

          //ensure connection fails
          exec('nc -w 1 ' + upstream_ip + ' 4040', (error, stdout, stderr) => {
            assert(error != null)
            assert(error.code == 1)

            exec('docker exec sta1 bash -c "sleep 0.1; echo ' + dataString + ' | nc -w 2 192.168.100.1 4040"', (error, stdout, stderr) => {
              assert(error == null)
              assert(outBuf.trim() == dataString.trim())
              done()
            })
          })

        })

      })
  })


  it('should delete port 4040 and no longer be reachable on LAN nor WAN', function(done) {
    this.timeout(5000)

    agent
      .delete('/firewall/service_port')
      .send({Port: "4040", Protocol: "tcp", UpstreamEnabled: false})
      .expect(200)
      .end((err, res) => {
        assert(res.status == 200)

        //ensure the port is no longer reachable from LAN or WAN
        let dataString = "SPR Planet"

        var outBuf = ""
        const server = spawn('/bin/bash', ['-c', 'docker exec superbase bash -c "timeout 10 nc -w 1 -l -p 4040"'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'inherit']
        })

        server.stdout.on('data', (data) => {
          outBuf += data
        })

        exec('docker exec superbase ip a l eth0 | awk \'/inet/ {print $2}\' | cut -d/ -f1', (error, stdout, stderr) => {
          let upstream_ip = stdout.trim()
          assert(upstream_ip.length != 0)

          //ensure connection fails
          exec('nc -w 1 ' + upstream_ip + ' 4040', (error, stdout, stderr) => {
            assert(error != null)
            assert(error.code == 1)

            exec('docker exec sta1 bash -c "sleep 0.1; echo ' + dataString + ' | nc -w 2 192.168.100.1 4040"', (error, stdout, stderr) => {
              assert(error != null)
              assert(error.code == 1)
              done()
            })
          })

        })

      })
  })

})
