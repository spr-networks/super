const { REACT_APP_API } = process.env;
const NFT_VERSION = "0.9.7";
let API = document.location.origin;
let API_HOST = document.location.host;
let ws;

if (REACT_APP_API) {
  try {
    let url = new URL(REACT_APP_API)
    API = url.toString()
    API_HOST = API.host
  } catch (e) {
    // REACT_APP_API=mock -- dont load in prod
    let MockAPI = import('./MockAPI').then(m => m.default())
  }
}

export const zoneDescriptions = {
  "dns" : "Outbound DNS Access",
  "wan": "Outbound Internet Access",
  "lan": "LAN access",
  "isolated" : "No access. By default devices without a group are treated as isolated"
}

export function authHeader() {
    // return authorization header with basic auth credentials
    let user = JSON.parse(localStorage.getItem('user'));

    if (user && user.authdata) {
        return 'Basic ' + user.authdata;
    } else {
        return '';
    }
}

export function testLogin(username, password, callback) {

  fetch(API+'/status', {
    method: 'GET', // or 'PUT'
    headers: {
      'Authorization': 'Basic ' +  btoa(username+":"+password),
      'X-Requested-With': 'react',
      'Content-Type': 'application/json',
    }
  })
  .then(function(response) {
    if(!response.ok)
    {
      throw new Error(response.status)
    }
    return response.json()
  })
  .then(data => {
    if (data == "Online") {
      return callback(true)
    }
    return callback(false)
  })
  .catch((error) => {
    console.error('Error:', error);
    return callback(false)
  });

}

function getAPIJson(endpoint) {
  return new Promise((resolve, reject) =>  {
    fetch(API+endpoint, {
      method: 'GET',
      headers: {
        'Authorization': authHeader(),
        'X-Requested-With': 'react',
        'Content-Type': 'application/json',
      }
    })
    .then(function(response) {
      if(!response.ok)
      {
        throw new Error(`${endpoint}: ` + response.status)
      }
      return response.json()
    })
    .then(data => {
      resolve(data)
    }).catch(reason => {
      reject(reason)
    })
  })
}

function getAPI(endpoint) {
  return new Promise((resolve, reject) =>  {
    fetch(API+endpoint, {
      method: 'GET',
      headers: {
        'Authorization': authHeader(),
        'X-Requested-With': 'react',
        'Content-Type': 'application/json',
      }
    })
    .then(function(response) {
      if(!response.ok)
      {
        throw new Error(response.status)
      }
      return response.text()
    })
    .then(data => {
      resolve(data)
    }).catch(reason => {
      reject(reason)
    })
  })
}

function delsetZone(verb, name, disabled, tags) {
  let data = {}
  if (name) {
    data["Name"] = name
  }
  if (disabled) {
    data["Disabled"] = disabled
  }
  if (tags) {
    data["ZoneTags"] = tags
  }

  return new Promise((resolve, reject) =>  {
    fetch(API + "/zones", {
      method: verb,
      headers: {
        'Authorization': authHeader(),
        'X-Requested-With': 'react',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(function(response) {
      if(!response.ok)
      {
        throw new Error(response.status)
      }
      return response.json()
    })
    .then(data => {
      resolve(data)
    }).catch(reason => {
      reject(reason)
    })
  })
}

function delsetDevice(verb, identity, psk, wpa_type, name, zones, tags) {
  let data = {"PSKEntry": {}}

  if (identity != "" && (identity.indexOf(":") != -1) ) {
    data["Mac"] = identity
  }

  if (psk != "") {
    data["PSKEntry"]["Psk"] = psk
  }

  if (wpa_type != "") {
    data["PSKEntry"]["Type"] = wpa_type
  }

  if (name != "") {
    data["Name"] = name
  }

  if (zones != null) {
    data["Zones"] = zones
  }

  if (tags != null) {
    data["DeviceTags"] = tags
  }

  return new Promise((resolve, reject) =>  {
    fetch(API + "/device/" + identity, {
      method: verb,
      headers: {
        'Authorization': authHeader(),
        'X-Requested-With': 'react',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(function(response) {
      if(!response.ok)
      {
        console.log("bad response")
        throw new Error(response.status)
      }
      if (verb == "DELETE") {
        resolve(true)
      } else {
        return response.json()
      }
    })
    .then(data => {
      resolve(data)
    }).catch(reason => {
      reject(reason)
    })
  })
}

export function setPSK(mac, psk, wpa_type, name) {
  if (mac == "") {
    mac = "pending"
  }
  return delsetDevice('PUT', mac, psk, wpa_type, name)
}

export function updateDeviceName(mac, name) {
  return delsetDevice('PUT', mac, "", "", name)
}

export function updateDeviceZones(mac, zones) {
  return delsetDevice('PUT', mac, "", "", "", zones)
}

export function updateDeviceTags(mac, tags) {
  return delsetDevice('PUT', mac, "", "", "", null, tags)
}


export function deleteDevice(mac) {
  return delsetDevice('DELETE', mac)
}


//export function updateZone(zone, disabled, tags)
//export function deleteZone(zone)

export function getDevices() {
  return getAPIJson("/devices")
}

export function getZones() {
  return getAPIJson("/zones")
}

export function pendingPSK() {
  return getAPIJson("/pendingPSK")
}

export function getArp() {
  return getAPIJson("/arp")
}

export function getNFVerdictMap(zone) {
  function translate(n) {
    if (n == "wan") {
      return "internet_access"
    } else if (n == "dns") {
      return "dns_access"
    } else if (n == "lan") {
      return "lan_access"
    } else if (n == "dhcp") {
      return "dhcp_access"
    }
    //tbd handle _dst_access also
    return n+"_mac_src_access"
  }

  return getAPIJson("/nfmap/" + translate(zone)).then(
    (v) => {
      let vmap = v.nftables[1].map
      let results = []
      if (vmap.elem && vmap.type) {
        for (const device of vmap.elem) {
          let info = {}
          let i = 0
          for (const t of vmap.type) {
            info[t] = device[0].concat[i]
            i += 1
          }
          results.push(info)
        }
      }
      return results
    }
  )
}

export function hostapdAllStations() {
  return getAPIJson("/hostapd/all_stations")
}

export function hostapdConfiguration() {
  return getAPI("/hostapd/config")
}

export function getTraffic(name) {
  return getAPIJson("/traffic/" + name)
}

export function getTrafficHistory() {
  return getAPIJson("/traffic_history")
}

export function ipAddr() {
  return getAPIJson("/ip/addr")
}

function delset(verb, url, data) {
  return new Promise((resolve, reject) =>  {
    fetch(`${API}/${url}`, {
      method: verb,
      headers: {
        'Authorization': authHeader(),
        'X-Requested-With': 'react',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error(response.status)
      }

      if (verb == 'DELETE') {
        return resolve(true)
      }

      return response.json()
    })
    .then(data => {
      resolve(data)
    }).catch(reason => {
      reject(reason)
    })
  })
}

export function getDNSConfig() {
  return getAPIJson(`/plugins/dns/block/config`)
}

export function getDNSBlocklists() {
  return getAPIJson(`/plugins/dns/block/blocklists`)
}

export function updateDNSBlocklist(data) {
  delset('PUT', `plugins/dns/block/blocklists`, data)
}

export function deleteDNSBlocklist(data) {
  delset('DELETE', `plugins/dns/block/blocklists`, data)
}

export function updateDNSOverride(data) {
  delset('PUT', `plugins/dns/block/override`, data)
}

export function deleteDNSOverride(data) {
  delset('DELETE', `plugins/dns/block/override`, data)
}

export function ConnectWebsocket(messageCallback) {

  let userData  = JSON.parse(localStorage.getItem('user'));

  ws = new WebSocket("ws://" + API_HOST + "/ws")

  ws.addEventListener('open', (event) => {
    ws.send(userData["username"] + ":" + userData["password"])
  })

  ws.addEventListener('message', (event) => {
    messageCallback(event)
  })

  return ws
}

export function saveLogin(username, password) {
  localStorage.setItem('user', JSON.stringify({ "authdata": btoa(username+":"+password), "username": username, "password": password }))
}
