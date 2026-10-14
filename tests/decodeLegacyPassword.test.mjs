import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeLegacyPassword } from '../startos/decodeLegacyPassword.ts'

test('preserves every byte from a 0.3.5 pwd.dat, including high bytes and trailing newline', () => {
  const original = Buffer.from([0x00, 0x41, 0x7f, 0x80, 0xff, 0x0a])
  const wrapped = original.toString('base64').replace(/(.{4})/g, '$1\n')
  const password = decodeLegacyPassword({ walletPasswordBase64: wrapped })
  assert.equal(password, original.toString('latin1'))
  assert.deepEqual(Buffer.from(password, 'latin1'), original)
})

test('rejects a missing, empty, malformed or truncated password', () => {
  for (const value of [null, {}, { walletPasswordBase64: '' }, { walletPasswordBase64: '%%%' }, { walletPasswordBase64: 'YQ=' }]) {
    assert.equal(decodeLegacyPassword(value), null)
  }
})
