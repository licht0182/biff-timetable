import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const appBase = process.env.BIFF_BASE || '/biff-timetable/'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'app-icon.svg'],
      manifest: {
        name: 'BIFF Timetable',
        short_name: 'BIFF 시간표',
        description: '부산국제영화제 개인 상영 시간표',
        id: appBase,
        start_url: appBase,
        scope: appBase,
        display: 'standalone',
        background_color: '#e5e7eb',
        theme_color: undefined,
        lang: 'ko',
        orientation: 'portrait-primary',
        icons: [
          { src: 'app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: `${appBase}index.html`,
        navigateFallbackDenylist: [/\/screenings\.json/, /\/films-2026(?:\.meta)?\.json/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: appBase,
})
