import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // La app se carga desde el APK, no por red, así que un paquete de ~700 KB no penaliza.
    chunkSizeWarningLimit: 900,
  },
})
