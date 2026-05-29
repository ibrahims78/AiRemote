import 'dotenv/config'
import { buildServer } from './app'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'

async function main() {
  const app = await buildServer()
  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 AiRemote Server running on http://${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
