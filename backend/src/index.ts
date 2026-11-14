import 'dotenv/config'
import mongoose from 'mongoose'
import { createServer } from 'node:http'
import { loadEnv } from './config/env'
import { createApp } from './app'
import { createSessions, sessionConfig } from './auth/sessions'
import { createSocketServer } from './socket'

const env = loadEnv()
const app = createApp(env)
const httpServer = createServer(app)
// Live updates on the same server and port, authenticated with the same session cookie.
const io = createSocketServer(httpServer, env, createSessions(sessionConfig(env.COOKIE_SECURE)))

async function startServer(): Promise<void> {
   await mongoose.connect(env.MONGODB_URI)
   console.log('Connected to MongoDB')

   httpServer.listen(env.PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${env.PORT}`)
   })

   // Graceful shutdown: stop accepting connections, close sockets, then the DB.
   const shutdown = (signal: string): void => {
      console.log(`${signal} received. Shutting down...`)
      void io.close(async () => {
         try {
            await mongoose.disconnect()
            console.log('MongoDB disconnected')
            process.exit(0)
         } catch (error) {
            console.error('Error disconnecting MongoDB:', error)
            process.exit(1)
         }
      })
   }

   process.once('SIGINT', () => shutdown('SIGINT'))
   process.once('SIGTERM', () => shutdown('SIGTERM'))
}

startServer().catch((error: unknown) => {
   console.error('Failed to start server:', error)
   process.exit(1)
})
