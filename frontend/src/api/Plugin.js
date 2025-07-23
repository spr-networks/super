import API from './API'

export class APIPlugin extends API {
  constructor() {
    super('')
  }

  list() {
    return this.get('/plugins')
  }
  add(data) {
    return this.put(`/plugins/${data.Name}`, data)
  }
  update(data) {
    return this.add(data)
  }
  remove(data) {
    return this.delete(`/plugins/${data.Name}`, data)
  }
  getPlusToken() {
    return this.get('/plusToken')
  }
  validPlusToken() {
    return this.get('/plusTokenValid')
  }
  setPlusToken(data) {
    return this.put('/plusToken', data)
  }
  stopPlusExtension(name) {
    return this.put(`/stopPlusExtension`, name)
  }
  startPlusExtension(name) {
    return this.put(`/startPlusExtension`, name)
  }
  completeInstall(plugin) {
    return this.put('/plugin/complete_install', plugin)
  }
  
  // Fetch plugin info using the two-phase API approach
  async downloadInfo(gitUrl) {
    try {
      const response = await fetch('/plugin/download_info', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gitUrl)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to download plugin info: ${errorText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      throw new Error(`Could not fetch plugin manifest: ${err.message}`)
    }
  }

  // Parse plugin permissions from manifest
  parsePermissions(manifest) {
    const permissions = {
      hasToken: false,
      scopedPaths: [],
      accessLevel: 'NONE'
    }

    // Check for InstallTokenPath - indicates plugin needs API access
    if (manifest.InstallTokenPath) {
      permissions.hasToken = true
      
      // Check for ScopedPaths
      if (manifest.ScopedPaths && Array.isArray(manifest.ScopedPaths) && manifest.ScopedPaths.length > 0) {
        permissions.scopedPaths = manifest.ScopedPaths
        permissions.accessLevel = 'SCOPED'
      } else {
        // Has token but no scoped paths = FULL access
        permissions.accessLevel = 'FULL'
      }
    }

    return permissions
  }

  // Format permissions for display
  formatPermissions(permissions) {
    if (permissions.accessLevel === 'NONE') {
      return {
        level: 'No API Access',
        description: 'This plugin does not require access to SPR APIs',
        paths: [],
        accessLevel: 'NONE'
      }
    }
    
    if (permissions.accessLevel === 'FULL') {
      return {
        level: 'Full API Access',
        description: 'This plugin requires FULL access to all SPR APIs',
        paths: ['/*'],
        accessLevel: 'FULL'
      }
    }
    
    return {
      level: 'Scoped API Access',
      description: 'This plugin requires access to specific SPR APIs:',
      paths: permissions.scopedPaths,
      accessLevel: 'SCOPED'
    }
  }
}

export const pluginAPI = new APIPlugin()
