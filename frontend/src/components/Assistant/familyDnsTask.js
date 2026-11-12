import { parentalAPI } from 'api'
import { deviceAPI } from './assistantDeviceApi'
import { boolean, object, string } from './operationSchema'
import { matchRef, cloneTask as clone, deviceId, exact, executeTaskSteps, need, publicDevice, sameTaskState as same } from './taskRuntime'

const members = (value, label) => {
  need(value === null || Array.isArray(value) && value.every(v => typeof v === 'string'), `${label} unavailable; refresh before changing family DNS`)
  return value || []
}

export const createFamilyDnsTask = (services = { deviceAPI, parentalAPI }) => {
  const snapshot = async () => {
    const [personas, inventory] = await Promise.all([services.parentalAPI.personas(), services.deviceAPI.list()])
    need(Array.isArray(personas), 'Family personas unavailable')
    need(inventory && typeof inventory === 'object' && !Array.isArray(inventory), 'Device inventory unavailable')
    const devices = Object.values(inventory).map(publicDevice).sort((a, b) => String(deviceId(a)).localeCompare(String(deviceId(b))))
    need(devices.every(d => typeof deviceId(d) === 'string' && deviceId(d).length), 'A device has no usable identity')
    need(new Set(devices.map(d => d.MAC ? d.MAC.toLowerCase() : d.WGPubKey)).size === devices.length, 'Device identities are ambiguous')
    devices.forEach(d => members(d.DeviceTags, 'Device membership tags'))
    need(personas.every(p => typeof p.Tag === 'string' && p.Tag.startsWith('persona:') && typeof p.DNSFamily === 'boolean'), 'Family DNS configuration is incomplete')
    need(new Set(personas.map(p => p.Tag)).size === personas.length, 'Persona tags are ambiguous')
    return clone({ personas, devices })
  }
  const project = (input, before) => {
    need(typeof input.enabled === 'boolean', 'Choose whether family DNS should be enabled')
    const selected = exact(before.personas, p => matchRef(before.personas, input.persona, ['Name', 'Tag']).includes(p), 'family persona')
    need(['Name', 'Description', 'DailyLimitMinutes', 'Schedules', 'Disabled'].every(k => selected[k] !== undefined), 'Persona settings are incomplete')
    const personas = before.personas.map(p => p.Tag === selected.Tag ? { ...p, DNSFamily: input.enabled } : p)
    const devices = before.devices.map(d => {
      const tags = members(d.DeviceTags, 'Device membership tags')
      if (!tags.includes(selected.Tag)) return d
      const policies = members(d.Policies, 'Device policies')
      const wantsFamily = personas.some(p => tags.includes(p.Tag) && p.DNSFamily)
      const next = wantsFamily ? [...new Set([...policies, 'dns:family'])] : policies.filter(p => p !== 'dns:family')
      return { ...d, Policies: next }
    })
    return clone({ personas, devices })
  }
  return {
    id: 'tasks.family.dns', domain: 'tasks', kind: 'write', task: true,
    label: 'Change family DNS for an existing persona',
    description: 'Enable or disable family DNS for one existing named persona and its actual current members. Code reads current membership, preserves time limits, schedules, Disabled state, tags and other policies, and retains family DNS required by another assigned persona. A persona with no devices is supported. No changes are sent before review.',
    schema: object({ persona: string({ minLength: 1, maxLength: 256 }), enabled: boolean() }, ['persona', 'enabled']),
    menus: ['Devices'], relatedDomains: ['devices'],
    sources: ['frontend/src/components/Assistant/familyDnsTask.js', 'frontend/src/views/Devices/Personas.js', 'api/code/parentalcontrols.go'],
    snapshot, project,
    noChangeSummary: 'Family DNS and the current members’ policies already match. No changes were sent; DNS query results were not tested.',
    run: async (input, context) => {
      const expected = project(input, context.before)
      need(same(expected, context.after), 'Family DNS review no longer matches its scope')
      const wanted = exact(expected.personas, p => matchRef(expected.personas, input.persona, ['Name', 'Tag']).includes(p), 'family persona')
      const old = exact(context.before.personas, p => p.Tag === wanted.Tag, 'family persona')
      let prior = clone(context.before)
      const steps = []
      const add = (label, next, write) => {
        steps.push({ label, before: clone(prior), after: clone(next), read: snapshot, write })
        prior = clone(next)
      }
      if (!same(old, wanted)) add(`Family DNS for ${wanted.Name}`, { ...prior, personas: expected.personas }, () => services.parentalAPI.savePersona(clone(wanted)))
      for (const nextDevice of expected.devices) {
        const current = prior.devices.find(d => deviceId(d) === deviceId(nextDevice))
        if (!same(current.Policies, nextDevice.Policies)) {
          const next = { ...prior, devices: prior.devices.map(d => deviceId(d) === deviceId(nextDevice) ? nextDevice : d) }
          add(`Family DNS policy for ${nextDevice.Name || deviceId(nextDevice)}`, next,
            () => services.deviceAPI.update(deviceId(nextDevice), { Policies: clone(nextDevice.Policies) }))
        }
      }
      return executeTaskSteps(steps)
    },
    verify: async (input, before, result) => {
      const actual = await snapshot(), expected = project(input, before)
      return { verified: Boolean(result.complete && same(actual, expected)), data: actual,
        summary: result.complete && same(actual, expected)
          ? 'Family DNS configuration and current member policies were read back. Time controls and membership were preserved; DNS queries were not tested.'
          : 'Family DNS setup is incomplete or changed during verification. Inspect the current settings before continuing.' }
    }
  }
}
