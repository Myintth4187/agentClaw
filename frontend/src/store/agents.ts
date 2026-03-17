import * as api from '../lib/api'

export async function fetchAgents() {
  const result = await api.listAgents()
  return result.agents || []
}

export async function fetchAgentDetail(agentId: string) {
  const filesResult = await api.listAgentFiles(agentId)
  // Bridge returns a flat array: [{name, path, type, size, modified}]
  const isArray = Array.isArray(filesResult)
  const files = isArray
    ? (filesResult as any[])
        .filter((f: any) => f.type === 'file')
        .map((f: any) => ({
          name: f.name,
          path: f.path,
          missing: false,
          size: f.size ?? 0,
          updatedAtMs: f.modified ? new Date(f.modified).getTime() : 0,
        }))
    : ((filesResult as any)?.files || [])
  const workspace = isArray ? '' : ((filesResult as any)?.workspace || '')
  return { agentId, workspace, files }
}

export async function createNewAgent(name: string, workspace?: string, installedSkills?: string[], model?: string) {
  return api.createAgent(name, workspace, installedSkills, model)
}

export async function updateExistingAgent(agentId: string, updates: {
  name?: string; workspace?: string; model?: string; avatar?: string;
}) {
  return api.updateAgent(agentId, updates)
}

export async function removeAgent(agentId: string, deleteFiles = false) {
  return api.deleteAgent(agentId, deleteFiles)
}

export async function fetchDashboardStats(agentCount?: number) {
  const [sessions, skills] = await Promise.all([
    api.listSessions().catch(() => []),
    api.listSkills().catch(() => []),
  ])
  return {
    totalAgents: agentCount ?? 0,
    totalSessions: sessions.length,
    totalSkills: skills.length,
  }
}
