import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { base64 } from 'rfc4648'
import { lndDataDir, mainVolumeHost, selfRestUrl } from './utils'

export const certPath = `${mainVolumeHost}/tls.cert`

/** Hit LND's /v1/state REST endpoint on loopback using its TLS cert. */
export async function getLndState(): Promise<string | null> {
  const ca = await readFile(certPath).catch(() => null)
  return new Promise((resolve) => {
    const req = request(
      `${selfRestUrl}/v1/state`,
      { ca: ca ?? undefined, rejectUnauthorized: !!ca, timeout: 5000 },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve((JSON.parse(data) as { state: string }).state)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

export const isPastUnlock = (state: string | null) =>
  state === 'UNLOCKED' || state === 'RPC_ACTIVE' || state === 'SERVER_ACTIVE'

export const refusedWalletPassword =
  /^invalid passphrase for master public key$/i

export function parseGatewayReply(
  stdout: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stdout)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

type Run = (
  command: string[],
  input: string,
) => Promise<{ exitCode: number | null; stdout: unknown; stderr: unknown }>

/**
 * `already`: the wallet was open before this request, so it proves nothing
 * about the password. `passphrase`: the wallet rejected the password. `lnd`:
 * LND answered but did not unlock, for another reason. `transport`: no usable
 * answer.
 */
export type UnlockOutcome =
  | { ok: true; already: boolean }
  | { ok: false; kind: 'passphrase' | 'lnd' | 'transport'; message: string }

/** A plain unlock through curl in a subcontainer; the password goes over stdin. */
export async function unlockWallet(
  run: Run,
  password: string,
  recoveryWindow: number | null,
): Promise<UnlockOutcome> {
  const pw = base64.stringify(Buffer.from(password, 'latin1'))
  const res = await run(
    [
      'curl',
      '--no-progress-meter',
      '-X',
      'POST',
      '--cacert',
      `${lndDataDir}/tls.cert`,
      `${selfRestUrl}/v1/unlockwallet`,
      '--data-binary',
      '@-',
    ],
    JSON.stringify(
      recoveryWindow
        ? { wallet_password: pw, recovery_window: recoveryWindow }
        : { wallet_password: pw },
    ),
  )
  const stdout = String(res.stdout).trim()
  if (stdout === '{}') return { ok: true, already: false }
  if (stdout.includes('wallet already unlocked'))
    return { ok: true, already: true }
  const message = parseGatewayReply(stdout)?.message
  if (typeof message === 'string' && message.trim()) {
    const trimmed = message.trim()
    return {
      ok: false,
      kind: refusedWalletPassword.test(trimmed) ? 'passphrase' : 'lnd',
      message: trimmed,
    }
  }
  return {
    ok: false,
    kind: 'transport',
    message:
      String(res.stderr).trim().split('\n').pop() ||
      `curl exited ${res.exitCode}`,
  }
}
