import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, beforeAll } from 'vitest'

/**
 * Connects this test file to its own throwaway database on the Compose MongoDB
 * and drops it afterwards. Run integration tests inside the backend container:
 *   docker compose exec backend npm test
 */
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
   })

   afterAll(async () => {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
   })
}
