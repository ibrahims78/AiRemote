import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { Client as SSH2Client } from 'ssh2'
import type { SFTPWrapper } from 'ssh2'

interface SSHCredentials {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
}

function buildSSHConfig(creds: SSHCredentials): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    host: creds.host,
    port: creds.port || 22,
    username: creds.username,
    readyTimeout: 15000
  }
  if (creds.privateKey) cfg.privateKey = Buffer.from(creds.privateKey, 'base64')
  else if (creds.password) cfg.password = creds.password
  return cfg
}

export async function sftpRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // List directory
  fastify.post<{ Body: SSHCredentials & { path?: string } }>('/list', async (request, reply) => {
    const { path = '/' } = request.body

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Connection timeout' }))
      }, 15000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          sftp.readdir(path, (err2, list) => {
            clearTimeout(timeout)
            client.end()
            if (err2) return reject(reply.code(500).send({ error: err2.message }))

            const normalizedPath = path.endsWith('/') ? path : path + '/'
            resolve(list.map(item => ({
              name: item.filename,
              path: normalizedPath === '/' ? '/' + item.filename : normalizedPath + item.filename,
              isDirectory: item.attrs.isDirectory(),
              size: item.attrs.size,
              modified: new Date((item.attrs.mtime || 0) * 1000).toISOString(),
              permissions: item.attrs.mode?.toString(8).slice(-3) || '---'
            })))
          })
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(request.body) as Parameters<typeof client.connect>[0])
    })
  })

  // Download file
  fastify.post<{ Body: SSHCredentials & { path: string } }>('/download', async (request, reply) => {
    const { path } = request.body
    if (!path) return reply.code(400).send({ error: 'path required' })

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Connection timeout' }))
      }, 30000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          const chunks: Buffer[] = []
          const readStream = sftp.createReadStream(path)

          readStream.on('data', (chunk: Buffer) => chunks.push(chunk))
          readStream.on('end', () => {
            clearTimeout(timeout)
            client.end()
            const buf = Buffer.concat(chunks)
            const name = path.split('/').pop() || 'file'
            reply.header('Content-Disposition', `attachment; filename="${name}"`)
            reply.header('Content-Type', 'application/octet-stream')
            resolve(reply.send(buf))
          })
          readStream.on('error', (e: Error) => {
            clearTimeout(timeout)
            client.end()
            reject(reply.code(500).send({ error: e.message }))
          })
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(request.body) as Parameters<typeof client.connect>[0])
    })
  })

  // Upload file
  fastify.post('/upload', async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'No file provided' })

    const fields = data.fields as Record<string, { value: string }>
    const host = fields.host?.value
    const username = fields.username?.value

    if (!host || !username) return reply.code(400).send({ error: 'host and username required' })

    const creds: SSHCredentials = {
      host,
      port: parseInt(fields.port?.value || '22'),
      username,
      password: fields.password?.value,
      privateKey: fields.privateKey?.value
    }
    const remotePath = fields.path?.value || '/'

    const fileBuffer = await data.toBuffer()
    const fileName = data.filename
    const uploadPath = remotePath.endsWith('/') ? remotePath + fileName : remotePath + '/' + fileName

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Upload timeout' }))
      }, 30000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          const writeStream = sftp.createWriteStream(uploadPath)
          writeStream.on('close', () => {
            clearTimeout(timeout)
            client.end()
            resolve(reply.send({ ok: true, path: uploadPath, size: fileBuffer.length }))
          })
          writeStream.on('error', (e: Error) => {
            clearTimeout(timeout)
            client.end()
            reject(reply.code(500).send({ error: e.message }))
          })
          writeStream.end(fileBuffer)
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(creds) as Parameters<typeof client.connect>[0])
    })
  })

  // Delete file or directory
  fastify.post<{ Body: SSHCredentials & { path: string; isDirectory?: boolean } }>('/delete', async (request, reply) => {
    const { path, isDirectory = false } = request.body
    if (!path) return reply.code(400).send({ error: 'path required' })

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Connection timeout' }))
      }, 15000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          const done = (e?: Error | null) => {
            clearTimeout(timeout)
            client.end()
            if (e) return reject(reply.code(500).send({ error: e.message }))
            resolve(reply.send({ ok: true }))
          }

          if (isDirectory) sftp.rmdir(path, done)
          else sftp.unlink(path, done)
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(request.body) as Parameters<typeof client.connect>[0])
    })
  })

  // Rename / move file
  fastify.post<{ Body: SSHCredentials & { oldPath: string; newPath: string } }>('/rename', async (request, reply) => {
    const { oldPath, newPath } = request.body
    if (!oldPath || !newPath) return reply.code(400).send({ error: 'oldPath and newPath required' })

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Connection timeout' }))
      }, 15000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          sftp.rename(oldPath, newPath, (e) => {
            clearTimeout(timeout)
            client.end()
            if (e) return reject(reply.code(500).send({ error: e.message }))
            resolve(reply.send({ ok: true }))
          })
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(request.body) as Parameters<typeof client.connect>[0])
    })
  })

  // Create directory
  fastify.post<{ Body: SSHCredentials & { path: string } }>('/mkdir', async (request, reply) => {
    const { path } = request.body
    if (!path) return reply.code(400).send({ error: 'path required' })

    return new Promise((resolve, reject) => {
      const client = new SSH2Client()
      const timeout = setTimeout(() => {
        client.end()
        reject(reply.code(504).send({ error: 'Connection timeout' }))
      }, 15000)

      client.on('ready', () => {
        client.sftp((err, sftp: SFTPWrapper) => {
          if (err) {
            clearTimeout(timeout)
            client.end()
            return reject(reply.code(500).send({ error: err.message }))
          }

          sftp.mkdir(path, (e) => {
            clearTimeout(timeout)
            client.end()
            if (e) return reject(reply.code(500).send({ error: e.message }))
            resolve(reply.send({ ok: true }))
          })
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        reject(reply.code(500).send({ error: err.message }))
      })
      client.connect(buildSSHConfig(request.body) as Parameters<typeof client.connect>[0])
    })
  })
}
