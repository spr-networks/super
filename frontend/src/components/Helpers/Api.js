let API = document.location.origin;

try {
  if (process && process.env.REACT_APP_API) {
    API = process.env.REACT_APP_API
  }
} catch (e) {

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
      console.log('Success:', data);
      return callback(true)
    }
    return callback(false)
  })
  .catch((error) => {
    //console.error('Error:', error);
    return callback(false)
  });

}

export function hostapdAllStations(callback) {
  fetch(API+'/hostapd/all_stations ', {
    method: 'GET', // or 'PUT'
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
    return response.json()
  })
  .then(data => {
    return callback(data)
  })

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

export function getDevices() {
  return getAPIJson("/devices")
}

export function getZones() {
  return getAPIJson("/zones")
}

export function pendingPSK() {
  return getAPIJson("/pendingPSK")
}


function delsetPSK(verb, mac, psk, wpa_type, comment) {
  let data = {"Type": wpa_type}
  if (mac != "") {
    data["Mac"] = mac
  }
  if (psk != "") {
    data["Psk"] = psk
  }

  if (comment != "") {
    data["Comment"] = comment
  }

  return new Promise((resolve, reject) =>  {
    fetch(API + "/setPSK", {
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

function delsetZone(verb, zone, mac, comment) {
  let data = {}
  if (mac != "") {
    data["Mac"] = mac
  }
  if (comment != "") {
    data["Comment"] = comment
  }
  return new Promise((resolve, reject) =>  {
    fetch(API + "/zone/" + zone, {
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
export function setPSK(mac, psk, wpa_type, comment) {
    return delsetPSK('PUT', mac, psk, wpa_type, comment)
}

export function delPSK(mac, psk, wpa_type, comment) {
    return delsetPSK('DELETE', mac, psk, wpa_type, comment)
}

export function delZone(zone, mac, comment) {
    return delsetZone('DELETE', zone, mac, comment)
}

export function addZone(zone, mac, comment) {
    return delsetZone('PUT', zone, mac, comment)
}

export function saveLogin(username, password) {
    localStorage.setItem('user', JSON.stringify({ "authdata": btoa(username+":"+password) }))
}

export function getStations(username, password) {
    localStorage.setItem('user', JSON.stringify({ "authdata": btoa(username+":"+password) }))
}
