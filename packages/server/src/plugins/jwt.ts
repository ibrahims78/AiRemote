import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'

interface SignOptions {
  expiresIn?: string | number
}

interface JwtPlugin {
  sign(payload: object, options?: SignOptions): string
  verify<T = unknown>(token: string): T
}

declare module 'fastify' {
  interface FastifyInstance {
    jwt: JwtPlugin
  }
  interface FastifyRequest {
    jwtVerify(): Promise<void>
    user: unknown
  }
}

export const jwtPlugin = fp(async function (fastify: FastifyInstance, opts: {
  secret: string
  sign?: SignOptions
}) {
  const secret = opts.secret
  const defaultSignOpts = opts.sign ?? {}

  const jwtApi: JwtPlugin = {
    sign(payload: object, options?: SignOptions): string {
      const merged = { ...defaultSignOpts, ...options }
      return jwt.sign(payload, secret, merged as jwt.SignOptions)
    },
    verify<T = unknown>(token: string): T {
      return jwt.verify(token, secret) as T
    }
  }

  fastify.decorate('jwt', jwtApi)

  fastify.decorateRequest('user', null)
  fastify.decorateRequest('jwtVerify', async function (this: FastifyRequest) {
    const auth = this.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new Error('No authorization header')
    }
    const token = auth.slice(7)
    this.user = jwt.verify(token, secret)
  })
})
