import API from './API'

export class APIPfw extends API {
  constructor() {
    super('/plugins/pfw/')
  }

  config() {
     return this.get('config');
   }

   addForward(data) {
     return this.put('forward', data);
   }
   updateForward(data, index) {
     return this.put(`forward/${index}`, data);
   }
   deleteForward(index) {
     return this.delete(`forward/${index}`, {});
   }

   addBlock(data) {
     return this.put('block', data);
   }
   updateBlock(data, index) {
     return this.put(`block/${index}`, data);
   }
   deleteBlock(index) {
     return this.delete(`block/${index}`, {});
   }

   addSiteVPN(data) {
     return this.put('sitevpns', data);
   }
   updateSiteVPN(data, index) {
     return this.put(`sitevpns/${index}`, data);
   }
   deleteSiteVPN(index) {
     return this.delete(`sitevpns/${index}`, {});
   }

   addGroups(data) {
     return this.put('group', data);
   }
   updateGroups(data, index) {
     return this.put(`group/${index}`, data);
   }
   deleteGroups(index) {
     return this.delete(`group/${index}`, {});
   }

   addTags(data) {
     return this.put('tag', data);
   }
   updateTags(data, index) {
     return this.put(`tag/${index}`, data);
   }
   deleteTags(index) {
     return this.delete(`tag/${index}`, {});
   }

   getVariable(name) {
     return this.get(`variable/${name}`);
   }

   deleteVariable(name) {
     return this.delete(`variable/${name}`);
   }
   testExpression(expr) {
     return this.post('testExpression', expr);
   }

   getTaskConfig() {
     return this.get('/tasks/config')
   }

   saveWifiScanTask(data) {
     return this.put('/tasks/configure/wifi-scan', data)
   }

   saveUplinkCheckTask(data) {
     return this.put('/tasks/configure/uplink-check', data)
   }

}

export const pfwAPI = new APIPfw()
