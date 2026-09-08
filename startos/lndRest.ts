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
 * One request to LND's REST API on loopback, pinned to its own tls.cert; an
 * unreadable certificate fails the request, never the pin. Made from this
 * process so a password never appears in a command line or a pipe. Reading the
 * certificate, connecting and receiving are all under one deadline and one
 * abort signal.
 */
async function rest(
  path: string,
  body: string | null,
  timeoutMs: number,
  abort?: AbortSignal,
): Promise<Reply> {
  if (abort?.aborted) return { error: 'aborted' }
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  abort?.addEventListener('abort', onAbort, { once: true })
  const deadline = setTimeout(() => ctrl.abort(), timeoutMs)
  const why = () =>
    abort?.aborted ? 'aborted' : `no answer within ${timeoutMs} ms`
  try {
    let ca: Buffer
    try {
      ca = await readFile(certPathHost, { signal: ctrl.signal })
    } catch (e) {
      return {
        error: ctrl.signal.aborted
          ? why()
          : `tls.cert unreadable: ${(e as Error).message}`,
      }
    }
    return await new Promise<Reply>((resolve) => {
      let done = false
      const finish = (reply: Reply) => {
        if (done) return
        done = true
        resolve(reply)
      }
      const req = request(
        `${selfRestUrl}${path}`,
        {
          method: body === null ? 'GET' : 'POST',
          ca,
          rejectUnauthorized: true,
          headers: body === null ? {} : { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
        },
        (res) => {
          let data = ''
          res.setEncoding('utf8')
          res.on('data', (c) => (data += c))
          res.on('end', () =>
            finish({ status: res.statusCode ?? 0, body: data }),
          )
          res.on('error', (e) => finish({ error: e.message }))
          res.on('close', () =>
            finish({ error: 'connection closed before the answer ended' }),
          )
        },
      )
      req.on('error', (e) =>
        finish({ error: ctrl.signal.aborted ? why() : e.message }),
      )
      req.on('close', () => finish({ error: 'connection closed' }))
      if (body !== null) req.write(body)
      req.end()
    })
  } finally {
    clearTimeout(deadline)
    abort?.removeEventListener('abort', onAbort)
  }
}

export async function getLndState(
  abort?: AbortSignal,
): Promise<LndState | null> {
  const reply = await rest('/v1/state', null, 5_000, abort)
  if ('error' in reply) return null
  try {
    return (JSON.parse(reply.body) as { state: LndState }).state
  } catch {
    return null
  }
}

// btcwallet's wording for a password that does not open the wallet. Anything
// else LND says is a failure of the operation, not of the password.
const REFUSED = /invalid passphrase for master public key/i

/**
 * `passphrase`: the wallet rejected the password. `lnd`: LND answered but did
 * not do what was asked, for another reason. `transport`: no usable answer.
 */
type UnlockOutcome =
  | { ok: true }
  | { ok: false; kind: 'passphrase' | 'lnd' | 'transport'; message: string }

/**
 * Unlock through the wallet unlocker. A pending macaroon rotation goes through
 * changepassword with the same password instead, which unlocks as a side
 * effect and rewrites every macaroon; `ok` on that path means the parsed reply
 * carried the new admin macaroon, which never leaves this function. Of an
 * error reply only the gateway's `message` field is returned, and no reply is
 * logged.
 */
export async function unlockWallet(
  password: string,
  flags: {
    recoveryWindow?: number | null
    rotateMacaroonRootKey?: boolean
  } = {},
  abort?: AbortSignal,
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
    abort,
  )
  if ('error' in reply)
    return { ok: false, kind: 'transport', message: reply.error }
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.body)
  } catch {
    return {
      ok: false,
      kind: 'transport',
      message: `unreadable answer (HTTP ${reply.status})`,
    }
  }
  const answer = (parsed ?? {}) as Record<string, unknown>
  if (reply.status >= 200 && reply.status < 300) {
    if (!rotate) return { ok: true }
    if (typeof answer.admin_macaroon === 'string') return { ok: true }
    return {
      ok: false,
      kind: 'lnd',
      message: 'rotation answered without a macaroon',
    }
  }
  const message =
    typeof answer.message === 'string' && answer.message.trim()
      ? answer.message.trim()
      : `HTTP ${reply.status}`
  // A state poll raced us: the wallet is open, which is all a plain unlock
  // asks for, but a rotation did not happen.
  if (!rotate && message.includes('wallet already unlocked'))
    return { ok: true }
  return {
    ok: false,
    kind: REFUSED.test(message) ? 'passphrase' : 'lnd',
    message,
  }
}
