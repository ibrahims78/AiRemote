import 'dotenv/config'
import { AgentService } from './agent'

const serverUrl = process.env.SERVER_URL || 'ws://localhost:3001/ws'
const deviceToken = process.env.DEVICE_TOKEN || ''

if (!deviceToken) {
  console.error('❌ DEVICE_TOKEN is required. Set it in .env file.')
  process.exit(1)
}

const agent = new AgentService(serverUrl, deviceToken)
agent.start()

process.on('SIGTERM', () => { agent.stop(); process.exit(0) })
process.on('SIGINT', () => { agent.stop(); process.exit(0) })
