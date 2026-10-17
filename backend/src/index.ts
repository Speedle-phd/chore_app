import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import pinoHttp from 'pino-http'
import { Server } from 'socket.io'
import { createServer } from 'node:http'

const app = express()
const httpServer = createServer(app)
const PORT = Number(process.env.PORT) || 3000
const MONGODB_URI = process.env.MONGODB_URI

const corsSettings = {
   origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
   methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}

const io = new Server(httpServer, {
   cors: corsSettings,
})

// Middleware
app.use(cors(corsSettings))
app.use(express.json())
app.use(pinoHttp())

// Health check
app.get('/api/health', (_req, res) => {
   res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database:
         mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
   })
})

// Example connection handler
io.on('connection', (socket) => {
   console.log('Client connected:', socket.id)

   socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
   })
})

// Start server
async function startServer(): Promise<void> {
   if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required')
   }

   await mongoose.connect(MONGODB_URI)
   console.log('Connected to MongoDB')

   const server = httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`)
   })

   // Graceful shutdown
   const shutdown = async (signal: string): Promise<void> => {
      console.log(`${signal} received. Shutting down...`)

      server.close(async () => {
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

   process.once('SIGINT', () => void shutdown('SIGINT'))
   process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

startServer().catch((error: unknown) => {
   console.error('Failed to start server:', error)
   process.exit(1)
})
