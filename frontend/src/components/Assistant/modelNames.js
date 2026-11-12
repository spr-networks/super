export const MODEL_TASK_NAMES = Object.freeze({
  'tasks.devices.internet_status': 'tasks.show.internet_permission',
  'tasks.devices.policies': 'tasks.show.device_policies',
  'tasks.devices.groups': 'tasks.show.device_groups',
  'tasks.devices.group_peers': 'tasks.show.devices_sharing_groups',
  'tasks.devices.dns_lists': 'tasks.show.device_dns_lists',
  'tasks.devices.entry': 'tasks.show.device_record',
  'tasks.devices.wifi_auth': 'tasks.show.wifi_security',
  'tasks.devices.wifi_signal': 'tasks.show.wifi_signal',
  'tasks.devices.matching': 'tasks.show.device_count',
  'tasks.family.schedule': 'tasks.show.family_schedule',
  'tasks.traffic.totals': 'tasks.show.traffic_totals',
  'tasks.plugins.status': 'tasks.show.plugins',
  'tasks.firewall.forwards': 'tasks.show.port_forwards',
  'tasks.vpn.peers': 'tasks.show.vpn_peers',
  'tasks.uplinks.health': 'tasks.show.uplink_health',
  'tasks.alerts.list': 'tasks.show.alert_rules',
  'tasks.alerts.events': 'tasks.show.alert_events',
  'tasks.guests.inspect': 'tasks.show.guest_access',
  'tasks.network.diagnose': 'tasks.show.network_diagnosis',
  'tasks.events.query': 'tasks.show.event_log',
  'tasks.firewall.port_forward': 'tasks.change.port_forward',
  'tasks.devices.internet': 'tasks.change.internet_access',
  'tasks.devices.rename': 'tasks.change.device_name',
  'tasks.devices.membership': 'tasks.change.device_groups',
  'tasks.devices.tags': 'tasks.change.device_tags',
  'tasks.family.limits': 'tasks.change.family_limits',
  'tasks.family.pause': 'tasks.change.family_pause',
  'tasks.ads.enable': 'tasks.change.ads_everywhere',
  'tasks.ads.devices': 'tasks.change.ads_for_devices',
  'tasks.access.allow': 'tasks.change.allow_service',
  'tasks.access.block': 'tasks.change.block_service',
  'tasks.alerts.create': 'tasks.change.new_alert_rule',
  'tasks.alerts.modify': 'tasks.change.edit_alert_rule',
  'tasks.family.dns': 'tasks.change.family_dns',
  'tasks.family.setup': 'tasks.setup.child',
  'tasks.uplink.pppoe': 'tasks.setup.pppoe',
  'tasks.uplink.wireless': 'tasks.setup.wireless_uplink',
  'tasks.dyndns.setup': 'tasks.setup.dyndns',
  'tasks.vpn.setup': 'tasks.setup.remote_vpn',
  'tasks.vpn.site': 'tasks.setup.site_vpn'
})

const INTERNAL_IDS = Object.freeze(Object.fromEntries(Object.entries(MODEL_TASK_NAMES).map(([id, name]) => [name, id])))
const matcher = names => new RegExp(`(?<![A-Za-z0-9_.])(${[...names].sort((a, b) => b.length - a.length).map(name => name.replace(/\./g, '\\.')).join('|')})(?![A-Za-z0-9_]|\\.[a-z])`, 'g')
const INTERNAL = matcher(Object.keys(MODEL_TASK_NAMES)), MODEL = matcher(Object.keys(INTERNAL_IDS))
export const RETIRED_PREFIX = 'tasks.renamed_away.'

export const toModelText = text => typeof text === 'string' ? text.replace(INTERNAL, id => MODEL_TASK_NAMES[id]) : text
export const toModelValue = value => value === undefined ? value : JSON.parse(toModelText(JSON.stringify(value)))
export const fromModelText = text => typeof text === 'string'
  ? text.replace(INTERNAL, id => `${RETIRED_PREFIX}${id.slice('tasks.'.length)}`).replace(MODEL, name => INTERNAL_IDS[name]) : text
export const fromModelValue = value => value === undefined ? value : JSON.parse(fromModelText(JSON.stringify(value)))
