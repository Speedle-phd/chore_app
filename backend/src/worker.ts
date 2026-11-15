import { writeFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import pino from 'pino'
import { loadEnv } from './config/env'
import { createMailer } from './mail/mailer'
import { runReminderDigests } from './reminders/digestJob'

/**
 * Background worker (its own container, same image as the backend): sends the
 * daily reminder digests. Wakes every few minutes; each person gets theirs once
 * their local time passes 08:00. Writes a heartbeat file for the health check.
 */
const env = loadEnv()
const log = pino({ name: 'worker' })
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60_000)
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat'

const sendMail = createMailer(env)
let running: Promise<void> | null = null
let stopping = false

async function tick() {
   if (running || stopping) return
   running = (async () => {
      try {
         const run = await runReminderDigests({
            now: new Date(),
            sendMail,
            appUrl: env.APP_URL,
            log: (message, extra) => log.warn(extra, message),
         })
         if (run.sent || run.failed) log.info(run, 'reminder digests')
         await writeFile(HEARTBEAT_FILE, new Date().toISOString())
      } catch (error) {
         log.error(error, 'reminder run failed')
      } finally {
         running = null
      }
   })()
   await running
}

async function main() {
   await mongoose.connect(env.MONGODB_URI)
   log.info({ intervalMs: INTERVAL_MS }, 'worker started')
   await tick()
   const timer = setInterval(() => void tick(), INTERVAL_MS)

   const shutdown = async (signal: string) => {
      stopping = true
      clearInterval(timer)
      log.info({ signal }, 'worker stopping')
      await running // let a run in progress finish its sends
      await mongoose.disconnect()
      process.exit(0)
   }
   process.on('SIGTERM', () => void shutdown('SIGTERM'))
   process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
   log.fatal(error, 'worker failed to start')
   process.exit(1)
})
