import assert from 'node:assert/strict'
import { test } from 'node:test'
import { materialStore, setMaterialStoreForTests } from '../app/lib/server/materials'

// Unit tests never reach a database, whatever the environment says.
delete process.env.LYCEO_SERVER_DATABASE_URL

const R2_ENV = {
  LYCEO_MATERIALS_BUCKET: 'test-bucket',
  LYCEO_MATERIALS_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  LYCEO_MATERIALS_R2_ACCESS_KEY_ID: 'test-key-id',
  LYCEO_MATERIALS_R2_SECRET_ACCESS_KEY: 'test-secret',
}

test('presigned upload URLs carry no checksum, which R2 would compare with the real file', async () => {
  const saved = Object.fromEntries(Object.keys(R2_ENV).map((k) => [k, process.env[k]]))
  Object.assign(process.env, R2_ENV)
  setMaterialStoreForTests(undefined)
  try {
    const store = materialStore()
    assert.ok(store, 'R2 storage is configured')
    // Signing happens locally: no request leaves the machine.
    const url = new URL(await store.presignPut('incoming/u/1', 'application/pdf', 2048, 600))
    const checksumParams = [...url.searchParams.keys()].filter((k) => k.toLowerCase().includes('checksum'))
    assert.deepEqual(checksumParams, [], 'a checksum of the empty body would make R2 reject every upload')
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host')
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600')
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    setMaterialStoreForTests(undefined)
  }
})
