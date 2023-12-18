/*
unix_plugin_router.HandleFunc("/block", modifyBlockRules).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/block/{index:[0-9]+}", modifyBlockRules).Methods("DELETE", "PUT")

tbd: check it actually blocks.

unix_plugin_router.HandleFunc("/forward", modifyForwardRules).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/forward/{index:[0-9]+}", modifyForwardRules).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/variable/{name}", handleVariable).Methods("DELETE", "GET", "PUT")
unix_plugin_router.HandleFunc("/testExpression", testExpression).Methods("POST")

unix_plugin_router.HandleFunc("/tag", modifyTags).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/tag/{index:[0-9]+}", modifyTags).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/group", modifyGroups).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/group/{index:[0-9]+}", modifyGroups).Methods("DELETE", "PUT")

unix_plugin_router.HandleFunc("/sitevpns", modifySiteVPN).Methods("DELETE", "PUT")
unix_plugin_router.HandleFunc("/sitevpns/{index:[0-9]+}", modifySiteVPN).Methods("DELETE", "PUT")

unix_plugin_router.HandleFunc("/tasks/run/{task}", runTaskOnce).Methods("PUT")
unix_plugin_router.HandleFunc("/tasks/configure/{task}", configTask).Methods("PUT")
*/

const agent = require('../agent')
const assert = require('assert')
const {exec} = require('node:child_process')

const delay = (milliseconds, fn) => {
  setTimeout(() => {
    fn();
  }, milliseconds);
};
const runCmd = (cmd, resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve(stdout)
  })
}

const NFT_verify_site_forward_tcp_empty = () => {
  return new Promise((resolve, reject) => {
    let d = "docker exec superapi nft -j list map inet filter site_forward_tcp_port"
    return runCmd(d, (result) => {
        //console.log("OKHI " + result)
        let d2 = "docker exec superapi nft -j list map inet mangle site_forward_tcp_port_mangle"
        runCmd(d2, (result2) => {
          //tcp_port
          let r1 = JSON.parse(result)
          let r2 = JSON.parse(result2)
          if (r1 && r2) {
            if (!r1.nftables[1].map.elem && !r2.nftables[1].map.elem) {
              resolve("1")
            }
          }
          reject('0')
        })
    })
    reject("fail")
  })
}


const NFT_verify_site_forward_tcp = (src_ip, dst_ip, port, interface) => {
  return new Promise((resolve, reject) => {
    let d = "docker exec superapi nft -j list map inet filter site_forward_tcp_port"
    return runCmd(d, (result) => {
        //console.log("OKHI " + result)
        let d2 = "docker exec superapi nft -j list map inet mangle site_forward_tcp_port_mangle"
        runCmd(d2, (result2) => {
          //tcp_port
          let r1 = JSON.parse(result)

          let r2 = JSON.parse(result2)
          if (JSON.stringify(r1.nftables[1].map.elem[0][0].concat) ==
            JSON.stringify([src_ip, dst_ip, port, interface])) {

              //tcp port mangle
              if (JSON.stringify(r2.nftables[1].map.elem[0][0].concat) ==
                JSON.stringify([src_ip, dst_ip, port])) {
                  resolve("1")
            }
          }
          reject('0')
        })
    })
    reject("fail")
  })
}



const NFT_verify_dnat_forward = (proto, src_ip, orig_dstip, dst_ip, port) => {
  return new Promise((resolve, reject) => {
    let d = "docker exec superapi nft -j list map inet nat dnat_" + proto + "_ipmap"
    return runCmd(d, (result) => {
        //console.log("OKHI " + result)
        let d2 = "docker exec superapi nft -j list map inet nat dnat_" + proto + "_portmap"
        runCmd(d2, (result2) => {
          //tcp_port
          let r1 = JSON.parse(result)

          let r2 = JSON.parse(result2)

          let match_part = r1.nftables[1].map.elem[0][0]
          let dst =  r1.nftables[1].map.elem[0][1]
          let dst_port = r2.nftables[1].map.elem[0][1]

          if (dst != dst_ip) {
            return reject('wrong destination ip')
          }

          if (dst_port != port) {
            return reject('wrong dst port')
          }

          let ip_match = JSON.stringify(r1.nftables[1].map.elem[0][0].concat)
          let port_match = JSON.stringify(r2.nftables[1].map.elem[0][0].concat)
          let expected_match = JSON.stringify([src_ip, orig_dstip, port])
          if (ip_match != port_match || ip_match != expected_match) {
            return reject("wrong matchings")
          }

          resolve("1")
        })
    })
    reject("fail")
  })
}

const NFT_verify_dnat_forward_empty = (proto) => {
  return new Promise((resolve, reject) => {
    let d = "docker exec superapi nft -j list map inet nat dnat_" + proto + "_ipmap"
    return runCmd(d, (result) => {
        //console.log("OKHI " + result)
        let d2 = "docker exec superapi nft -j list map inet nat dnat_" + proto + "_portmap"
        runCmd(d2, (result2) => {
          let r1 = JSON.parse(result)
          let r2 = JSON.parse(result2)

          if (r1 && r2) {
            if (!r1.nftables[1].map.elem && !r2.nftables[1].map.elem) {
              resolve("1")
            }
          }
          reject('0')
        })
    })
    reject("fail")
  })
}

describe('pfw', () => {
  it('get config', (done) => {
    agent
      .get('/plugins/pfw/config')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(
          Object.keys(res.body).includes('ForwardingRules'),
          'no forward rules'
        )
        assert(Object.keys(res.body).includes('BlockRules'), 'no block rules')

        assert(typeof res.body.Variables === 'object', 'no variables')

        done()
      })
  })

  it('mask token', (done) => {
    agent
      .get('/plugins/pfw/config')
      .expect(200)
      .end((err, res) => {
        assert(res.body.APIToken == '*masked*', 'no forward rules')

        done()
      })
  })

  it('block tcp always', (done) => {
    let block = {
      RuleName: 'Block TCP test',
      Time: { Days: [], Start: '', End: '' },
      Condition: '',
      Protocol: 'tcp',
      Client: { Group: '', Identity: '', SrcIP: '0.0.0.0' },
      Dst:  {"IP": '1.2.3.4'},
      DstPort: ''
    }

    agent
      .put('/plugins/pfw/block')
      .send(block)
      .expect(200)
      .end((err, res) => {
        assert(err == null, "failed to put rule")
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.BlockRules && res.body.BlockRules.length > 0, 'failed to add block')

            let id = 0

            //cleanup & verify delete works
            agent
              .delete(`/plugins/pfw/block/${id}`)
              .send({})
              .expect(200)
              .end((err, res) => {
                assert(err == null, "failed to delete block rule")
                done()
              })
          })
      })
  })

  it('block udp weekdays', (done) => {
    let block = {
      RuleName: 'NewFlow',
      Time: { Days: [0, 1, 1, 1, 1, 1, 0], Start: '10:00', End: '11:00' },
      Condition: '',
      Protocol: 'udp',
      Client: { Group: 'dns', Identity: '', SrcIP: '' },
      Dst:  {"IP": '1.2.3.4'},
      DstPort: ''
    }

    agent
      .put('/plugins/pfw/block')
      .send(block)
      .expect(200)
      .end((err, res) => {
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.BlockRules && res.body.BlockRules.length > 0, 'failed to add block')

            let id = 0

            //cleanup & verify delete works
            agent
              .delete(`/plugins/pfw/block/${id}`)
              .send({})
              .expect(200)
              .end((err, res) => {
                assert(err == null, "failed to delete udp block rule")
                done()
              })
          })
      })
  })

  it('forwards tcp port 80 to site dest', (done) => {
    let fwd = {
      RuleName: 'Forward TCP test',
      Time: { Days: [], Start: '', End: '' },
      Condition: '',
      Protocol: 'tcp',
      Client: { Group: '', Identity: '', SrcIP: '0.0.0.0' },
      OriginalDst:  {"IP": '192.168.1.10'},
      Dst:  {"IP": '192.168.2.20'},
      OriginalDstPort: "80",
      DstInterface: 'mitmproxy0'
    }

    agent
      .put('/plugins/pfw/forward')
      .send(fwd)
      .expect(200)
      .end((err, res) => {
        if (err != null) {
          console.log(res.text)
        }
        assert(err == null, "Failed to PUT forward rule")
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.ForwardingRules && res.body.ForwardingRules.length > 0, 'failed to add fowrard')

            delay(1100, () => {
              NFT_verify_site_forward_tcp("0.0.0.0", "192.168.1.10", 80, "mitmproxy0")
              .then(ok => {
                let id = 0
                //cleanup & verify delete works
                agent
                  .delete(`/plugins/pfw/forward/${id}`)
                  .send({})
                  .expect(200)
                  .end((err, res) => {
                    assert(err == null, "failed to delete rule")
                    NFT_verify_site_forward_tcp_empty()
                    .then(ok => {
                      done()
                    })
                  })
              })
              .catch((fail) => {
                assert("FAILED")
              })

            })
          })
      })
  })


  it('forwards tcp port 80', (done) => {
    let fwd = {
      RuleName: 'Forward TCP test',
      Time: { Days: [], Start: '', End: '' },
      Condition: '',
      Protocol: 'tcp',
      Client: { Group: '', Identity: '', SrcIP: '0.0.0.0' },
      OriginalDst:  {"IP": '192.168.1.10'},
      Dst:  {"IP": '192.168.2.20'},
      OriginalDstPort: "80",
      DstInterface: ''
    }

    agent
      .put('/plugins/pfw/forward')
      .send(fwd)
      .expect(200)
      .end((err, res) => {
        if (err != null) {
          console.log(res.text)
        }
        assert(err == null, "Failed to PUT forward rule")
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.ForwardingRules && res.body.ForwardingRules.length > 0, 'failed to add fowrard')

            delay(1100, () => {
              NFT_verify_dnat_forward("tcp", "0.0.0.0", "192.168.1.10", "192.168.2.20", 80)
              .then(ok => {
                let id = 0
                //cleanup & verify delete works
                agent
                  .delete(`/plugins/pfw/forward/${id}`)
                  .send({})
                  .expect(200)
                  .end((err, res) => {
                    assert(err == null, "failed to delete rule")
                    NFT_verify_dnat_forward_empty("tcp")
                    .then(ok => {
                      done()
                    })
                  })
              })
              .catch((fail) => {
                assert("FAILED")
              })

            })
          })
      })
  }, 10000)

  it('forwards udp port 69', (done) => {
    let fwd = {
      RuleName: 'Forward UDP test',
      Time: { Days: [], Start: '', End: '' },
      Condition: '',
      Protocol: 'udp',
      Client: { Group: '', Identity: '', SrcIP: '0.0.0.0' },
      OriginalDst:  {"IP": '192.168.1.10'},
      Dst:  {"IP": '192.168.2.20'},
      OriginalDstPort: "69",
      DstInterface: ''
    }

    agent
      .put('/plugins/pfw/forward')
      .send(fwd)
      .expect(200)
      .end((err, res) => {
        if (err != null) {
          console.log(res.text)
        }
        assert(err == null, "Failed to PUT forward rule")
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.ForwardingRules && res.body.ForwardingRules.length > 0, 'failed to add fowrard')

            delay(1100, () => {
              NFT_verify_dnat_forward("udp", "0.0.0.0", "192.168.1.10", "192.168.2.20", 69)
              .then(ok => {
                let id = 0
                //cleanup & verify delete works
                agent
                  .delete(`/plugins/pfw/forward/${id}`)
                  .send({})
                  .expect(200)
                  .end((err, res) => {
                    assert(err == null, "failed to delete rule")
                    NFT_verify_dnat_forward_empty("udp")
                    .then(ok => {
                      done()
                    })
                  })
              })
              .catch((fail) => {
                assert("FAILED")
              })

            })
          })
      })
  }, 10000)

})
