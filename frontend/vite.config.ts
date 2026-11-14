import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
   plugins: [react(), tailwindcss()],
   resolve: {
      alias: {
         '@': path.resolve(__dirname, './src'),
      },
   },
   server: {
      host: '0.0.0.0',
      proxy: {
         // Everything the browser needs from the backend goes through this
         // origin, so cookies stay first-party and no CORS is involved.
         '/api': {
            target: 'http://backend:3000',
            changeOrigin: true,
         },
         '/uploads': {
            target: 'http://backend:3000',
            changeOrigin: true,
         },
         '/socket.io': {
            target: 'http://backend:3000',
            changeOrigin: true,
            ws: true,
         },
      },
   },
})
