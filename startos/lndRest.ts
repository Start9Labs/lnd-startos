import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { base64 } from 'rfc4648'
import { certPathHost, selfRestUrl } from './utils'

// Per stateservice.proto: NON_EXISTING=0, LOCKED=1, UNLOCKED=2, RPC_ACTIVE=3,
// SERVER_ACTIVE=4, WAITING_TO_START=255. LOCKED onward means the wallet
// unlocker is serving.
export type LndState =
  | 'NON_EXISTING'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'RPC_ACTIVE'
  | 'SERVER_ACTIVE'
  | 'WAITING_TO_START'

export const isPastUnlock = (state: LndState | null) =>
  state === 'UNLOCKED' || state === 'RPC_ACTIVE' || state === 'SERVER_ACTIVE'

type Reply = { status: number; body: string } | { error: string }

/**
 * One request to LND's REST API on loopback, pinned to its own tls.cert. Made
 * from this process so a password never appears in a command line or a pipe.
 */
async function rest(
  path: string,
  body: string | null,
  timeoutMs: number,
): Promise<Reply> {
  const ca = await readFile(certPathHost).catch(() => null)
  return new Promise((resolve) => {
    const req = request(
      `${selfRestUrl}${path}`,
      {
        method: body === null ? 'GET' : 'POST',
        ca: ca ?? undefined,
        rejectUnauthorized: !!ca,
        timeout: timeoutMs,
        headers: body === null ? {} : { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: data }),
        )
      },
    )
    req.on('error', (e) => resolve({ error: e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ error: 'timed out' })
    })
    if (body !== null) req.write(body)
    req.end()
  })
}

export async function getLndState(): Promise<LndState | null> {
  const reply = await rest('/v1/state', null, 5_000)
  if ('error' in reply) return null
  try {
    return (JSON.parse(reply.body) as { state: LndState }).state
  } catch {
    return null
  }
}

/** `refused` is LND's own reason; null when no grpc-gateway answer arrived. */
export type UnlockOutcome =
  { ok: true } | { ok: false; refused: string | null; detail: string }

/**
 * Unlock through the wallet unlocker. A pending macaroon rotation goes through
 * changepassword with the same password instead, which unlocks as a side
 * effect and rewrites every macaroon; its reply carries the new admin macaroon,
 * so no reply body is ever logged or returned.
 */
export async function unlockWallet(
  password: string,
  flags: {
    recoveryWindow?: number | null
    rotateMacaroonRootKey?: boolean
  } = {},
): Promise<UnlockOutcome> {
  const pw = base64.stringify(Buffer.from(password, 'latin1'))
  const rotate = !!flags.rotateMacaroonRootKey
  const reply = await rest(
    rotate ? '/v1/changepassword' : '/v1/unlockwallet',
    JSON.stringify(
      rotate
        ? {
            current_password: pw,
            new_password: pw,
            new_macaroon_root_key: true,
          }
        : {
            wallet_password: pw,
            ...(flags.recoveryWindow
              ? { recovery_window: flags.recoveryWindow }
              : {}),
          },
    ),
    120_000,
  )
  if ('error' in reply) return { ok: false, refused: null, detail: reply.error }
  const body = reply.body.trim()
  // `{}` = unlocked. "wallet already unlocked" = a state poll raced us. A
  // rotation answers with the admin_macaroon field instead of `{}`.
  if (
    body === '{}' ||
    body.includes('wallet already unlocked') ||
    (rotate && body.includes('admin_macaroon'))
  ) {
    return { ok: true }
  }
  try {
    const message = JSON.parse(body).message
    if (typeof message === 'string') {
      return {
        ok: false,
        refused: message.trim(),
        detail: `HTTP ${reply.status}`,
      }
    }
  } catch {}
  return { ok: false, refused: null, detail: `HTTP ${reply.status}` }
}
