import 'dotenv/config'
import { AgentService, AGENT_VERSION } from './agent'

// ── Startup Banner ─────────────────────────────────────────────────────────
console.log('')
console.log('╔══════════════════════════════════════════╗')
console.log(`║      AiRemote Agent  v${AGENT_VERSION}              ║`)
console.log('║      Self-Hosted Remote Access           ║')
console.log('╚══════════════════════════════════════════╝')
console.log('')

const serverUrl  = process.env.SERVER_URL   || 'ws://localhost:3001/ws'
const deviceToken = process.env.DEVICE_TOKEN || ''

if (!deviceToken) {
  console.error('❌ DEVICE_TOKEN is required. Set it in .env file.')
  process.exit(1)
}

console.log(`📡 Server : ${serverUrl}`)
console.log(`🔑 Token  : ${deviceToken.slice(0, 8)}...`)
console.log('')

const agent = new AgentService(serverUrl, deviceToken)
agent.start()

process.on('SIGTERM', () => { agent.stop(); process.exit(0) })
process.on('SIGINT',  () => { agent.stop(); process.exit(0) })
