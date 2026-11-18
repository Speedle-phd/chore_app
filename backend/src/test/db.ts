import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, beforeAll } from 'vitest'

/**
 * Connects this test file to its own throwaway database on the Compose MongoDB
 * and drops it afterwards. Run integration tests inside the backend container:
 *   docker compose exec backend npm test
 */
/** Ten years: longer than any test's faked clock is ahead of or behind the real one. */
const TTL_IN_TESTS_S = 10 * 365 * 24 * 3600

/**
 * MongoDB removes documents from TTL indexes (sessions, pinboard posts) by the server's REAL
 * clock, about once a minute, while tests fake the clock (e.g. March 2026). A session made at
 * a faked past time is already "expired" in real time, so the sweep could delete it in the middle
 * of a test (401s at random, seen 2026-11-17). In these throwaway databases the TTL indexes get a
 * lifetime that never runs out; the app's own `expiresAt > now` checks still run with the faked clock.
 */
async function disarmTtlIndexes() {
   const db = mongoose.connection.db
   if (!db) return
   for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      for (const index of await db.collection(name).indexes()) {
         if (index.expireAfterSeconds === undefined) continue
         await db.command({ collMod: name, index: { keyPattern: index.key, expireAfterSeconds: TTL_IN_TESTS_S } })
      }
   }
}

export function useTestDatabase() {
   beforeAll(async () => {
      const uri = process.env.MONGODB_URI
      if (!uri) {
         throw new Error(
            'MONGODB_URI is not set. Run integration tests in the backend container: docker compose exec backend npm test',
         )
      }
      await mongoose.connect(uri, {
         dbName: `test_${randomBytes(6).toString('hex')}`,
      })
      await mongoose.connection.syncIndexes()
      // Every file builds all models' indexes at once on the shared MongoDB; under full parallel load that can pass 10 s.
      await disarmTtlIndexes()
   }, 60_000)

   afterAll(async () => {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
   }, 60_000)
}
