import { v4 as uuidv4 } from 'uuid'

interface TicketData {
  userId: string
  email:  string
  role:   string
  expiresAt: number
}

// In-memory store for short-lived WS authentication tickets.
// Tickets replace JWT-in-URL (?token=) so raw JWTs never appear in access logs.
// Each ticket: single-use, 30-second TTL.
const tickets = new Map<string, TicketData>()

const TICKET_TTL_MS = 30_000

function cleanup(): void {
  const now = Date.now()
  for (const [k, v] of tickets) {
    if (v.expiresAt < now) tickets.delete(k)
  }
}

export function createWsTicket(userId: string, email: string, role: string): string {
  cleanup()
  const ticket = uuidv4()
  tickets.set(ticket, { userId, email, role, expiresAt: Date.now() + TICKET_TTL_MS })
  return ticket
}

export function consumeWsTicket(ticket: string): TicketData | null {
  const data = tickets.get(ticket)
  tickets.delete(ticket)   // always delete — one-time use
  if (!data || data.expiresAt < Date.now()) return null
  return data
}
