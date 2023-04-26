import API from './API'

export class APIDevice extends API {
  constructor() {
    super('/')
  }

  list() {
    return this.get('/devices');
  }

  update(id, data) {
    if (data === undefined) {
      data = id;
      id = data.MAC || data.WGPubKey;
    }

    if (!data || !id) {
      throw new Error('No key specified');
    }

    // check if the device id is MAC or wg base64
    if (id.includes(':')) {
      data.MAC = id;
    } else if (id != 'pending') {
      data.WGPubKey = id;
    }

    return this.put(`/device?identity=${encodeURIComponent(id)}`, data);
  }

  copy(id, data) {
    return this.put(
      `/device?identity=pending&copy=${encodeURIComponent(id)}`,
      data
    );
  }

  updateName(id, Name) {
    return this.update(id, { Name });
  }

  updateIP(id, RecentIP) {
    return this.update(id, { RecentIP });
  }

  updateGroups(id, Groups) {
    return this.update(id, { Groups });
  }
  updateTags(id, DeviceTags) {
    return this.update(id, { DeviceTags });
  }
  deleteDevice(id) {
    return this.delete(`/device?identity=${encodeURIComponent(id)}`, {});
  }
  setPSK(MAC, Psk, Type, Name) {
    return this.update({ MAC, Name, PSKEntry: { Psk, Type } });
  }
  pendingPSK() {
    return this.get('/pendingPSK');
  }

  groups() {
    return this.get('/groups').then((res) => res.map((g) => g.Name));
  }
  tags() {
    return this.get('/devices').then((res) => [
      ...new Set(
        Object.values(res)
          .map((device) => device.DeviceTags)
          .flat()
      ),
    ]);
  }

  // TODO add this functionality to base api
  oui(mac) {
    return this.get(`/plugins/lookup/oui/${mac}`);
  }
  ouis(macs) {
    return this.get(`/plugins/lookup/ouis/${macs.join(',')}`);
  }
}

export const deviceAPI = new APIDevice()
