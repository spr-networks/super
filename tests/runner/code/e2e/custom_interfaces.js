const agent = require('../agent')
const assert = require('assert')
const {exec} = require('child_process')

const rule1 = {
  RuleName: 'test1',
  Disabled: false,
  Interface: 'test0',
  SrcIP: '172.100.100.100',
  RouteDst: '',
  Policies: ['wan', 'dns'],
  Groups: ['alpha', 'bravo', 'charlie'],
  Tags: []
}

const rule2 = {
  RuleName: 'test2',
  Disabled: false,
  Interface: 'test0',
  SrcIP: '172.102.102.102',
  RouteDst: '',
  Policies: ['wan', 'dns', 'api'],
  Groups: ['charlie', "delta"],
  Tags: []
}

describe("reset custom interface test states", () => {
  it("deletes rule1", (done) => {
    agent.delete('/firewall/custom_interface')
      .send(rule1)
      .end((err, res) => {
        done()
      })
  })

  it("deletes rule2", (done) => {
    agent.delete('/firewall/custom_interface')
      .send(rule2)
      .end((err, res) => {
        done()
      })
  })
})

describe('manage custom_interface fw rules', () => {
  it('should create and retrieve custom interface rules', function(done) {
    this.timeout(5000)
    createRule1()
      .then(verifyRule1Creation)
      .then(createRule2)
      .then(verifyRule2Creation)
      .then(deleteRule2)
      .then(verifyRule2Deletion)
      .then(() => done())
      .catch(done)
  })
})

function createRule1() {
  return new Promise((resolve, reject) => {
    agent
      .put('/firewall/custom_interface')
      .send(rule1)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200, "set rule1")
        resolve()
      })
  })
}

function verifyRule1Creation() {
  return new Promise((resolve, reject) => {
    agent
      .get('/firewall/config')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200, "got config")
        assert(Array.isArray(res.body.CustomInterfaceRules), 'CustomInterfaceRules should be an array')
        const createdRule = res.body.CustomInterfaceRules.find(rule => rule.RuleName === 'test1')
        assert(createdRule, 'Created rule not found in firewall config')
        assert.deepStrictEqual(createdRule.Policies, ['wan', 'dns'], 'Creation Policies do not match')
        assert.deepStrictEqual(createdRule.Groups, ['alpha', 'bravo', 'charlie'], 'Groups do not match')

        const commands = [
    //      `nft get element inet filter api_interfaces { "${rule1.Interface}" }`,
          `nft get element inet filter fwd_iface_wan { "${rule1.Interface}" . "${rule1.SrcIP}"}`,
          `nft get element inet filter dns_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter alpha_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter alpha_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter bravo_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter bravo_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter charlie_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter charlie_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`
        ]

        Promise.all(commands.map(cmd => executeCommand(cmd)))
          .then(results => {
            results.forEach(result => {
              assert(result.code === 0, `Command "${result.cmd}" failed with exit code ${result.code}`)
            })
            resolve()
          })
          .catch(reject)
      })
  })
}


function verifyRule2Creation() {
  return new Promise((resolve, reject) => {
    agent
      .get('/firewall/config')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200, "got config")
        assert(Array.isArray(res.body.CustomInterfaceRules), 'CustomInterfaceRules should be an array')
        const createdRule = res.body.CustomInterfaceRules.find(rule => rule.RuleName === 'test1')
        assert(createdRule, 'Created rule not found in firewall config')
        assert.deepStrictEqual(createdRule.Policies, ['wan', 'dns'], 'Creation Policies do not match')
        assert.deepStrictEqual(createdRule.Groups, ['alpha', 'bravo', 'charlie'], 'Groups do not match')

        const commands = [
          `nft get element inet filter api_interfaces { "${rule1.Interface}" }`,
          `nft get element inet filter fwd_iface_wan { "${rule1.Interface}" . "${rule1.SrcIP}"}`,
          `nft get element inet filter dns_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter alpha_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter alpha_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter bravo_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter bravo_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter charlie_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,
          `nft get element inet filter charlie_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`,

          `nft get element inet filter charlie_src_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`,
          `nft get element inet filter charlie_dst_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`,
          `nft get element inet filter delta_src_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`,
          `nft get element inet filter delta_dst_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`
        ]

        Promise.all(commands.map(cmd => executeCommand(cmd)))
          .then(results => {
            results.forEach(result => {
              assert(result.code === 0, `Command "${result.cmd}" failed with exit code ${result.code}`)
            })
            resolve()
          })
          .catch(reject)
      })
  })
}


function executeCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(`docker exec superapi ${cmd}`, (error, stdout, stderr) => {
      if (error) {
//        console.log(error)
        resolve({ cmd, code: error.code })
      } else {
        resolve({ cmd, code: 0 })
      }
    })
  })
}

function executeCommandExpect(expect, cmd) {
  return new Promise((resolve, reject) => {
    exec(`docker exec superapi ${cmd}`, (error, stdout, stderr) => {
      if (error) {
//        console.log(error)
        resolve({ cmd, code: error.code, expected: expect })
      } else {
        resolve({ cmd, code: 0, expected: expect })
      }
    })
  })
}

function createRule2() {
  return new Promise((resolve, reject) => {
    agent
      .put('/firewall/custom_interface')
      .send(rule2)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200, "set rule2")
        resolve()
      })
  })
}

function deleteRule2() {
  return new Promise((resolve, reject) => {
    agent
      .delete('/firewall/custom_interface')
      .send(rule2)
      .expect(200)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200, "deleted rule2")
        resolve()
      })
  })
}

function verifyRule2Deletion() {
  return new Promise((resolve, reject) => {
    agent
      .get('/firewall/config')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        if (err) return reject(err)
        assert(res.status == 200)
        assert(Array.isArray(res.body.CustomInterfaceRules), 'CustomInterfaceRules should be an array')
        const deletedRule = res.body.CustomInterfaceRules.find(rule => rule.RuleName === 'test0')
        assert(!deletedRule, 'Deleted rule should not be found in firewall config')

        const commands = [
          [1, `nft get element inet filter api_interfaces { "${rule2.Interface}" }`],
          [0, `nft get element inet filter fwd_iface_wan { "${rule1.Interface}" . "${rule1.SrcIP}"}`],
          [0, `nft get element inet filter dns_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter alpha_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter alpha_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter bravo_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter bravo_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter charlie_src_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],
          [0, `nft get element inet filter charlie_dst_access { "${rule1.SrcIP}" . "${rule1.Interface}"}`],

          [1, `nft get element inet filter charlie_src_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`],
          [1, `nft get element inet filter charlie_dst_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`],
          [1, `nft get element inet filter delta_src_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`],
          [1, `nft get element inet filter delta_dst_access { "${rule2.SrcIP}" . "${rule2.Interface}"}`]
        ]

        Promise.all(commands.map(cmd => executeCommandExpect(cmd[0], cmd[1])))
          .then(results => {
            results.forEach(result => {
              assert(result.code === result.expected, `Command "${result.cmd}" failed with exit code ${result.code}`)
            })
            resolve()
          })
          .catch(reject)

      })
  })
}
