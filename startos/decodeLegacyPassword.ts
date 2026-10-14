// StartOS 0.3.5's pwd.dat is raw bytes, not JSON. The in-place package
// migration treats those bytes as latin1; do the same for a remote import.
export function decodeLegacyPassword(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const encoded = (value as Record<string, unknown>).walletPasswordBase64
  if (typeof encoded !== 'string') return null

  // base64 on the origin may wrap lines. Reject malformed/truncated content
  // rather than storing a password that cannot unlock the imported wallet.
  const compact = encoded.replace(/\s+/g, '')
  if (
    !compact ||
    compact.length > 8192 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      compact,
    )
  )
    return null
  const bytes = Buffer.from(compact, 'base64')
  return bytes.length && bytes.toString('base64') === compact
    ? bytes.toString('latin1')
    : null
}
