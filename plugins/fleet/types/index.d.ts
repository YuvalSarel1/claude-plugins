export type Row = {
  id: string; name: string; cwd: string; state: string; detail: string; since: number
  model: string; effort: string; tokens: number | null; tasks: number | null; kind: string; prompt: string
  cpu: number | null; rss: number | null; cost: number | null; contextTokens: number | null; contextWindow: number | null
}

declare module 'claude-code' {
  interface PluginState {
    fleet: { rows: Row[]; minute: number }
  }
}
