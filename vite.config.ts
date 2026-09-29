import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const filmDataHash = createHash('sha256')
  .update(readFileSync(new URL('./public/screenings.json', import.meta.url)))
  .digest('hex')
  .slice(0, 12)

export default defineConfig({
  define: {
    __FILM_DATA_VERSION__: JSON.stringify(`2026-official-${filmDataHash}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'app-icon.svg'],
      manifest: {
        name: 'BIFF Timetable',
        short_name: 'BIFF 시간표',
        description: '부산국제영화제 개인 상영 시간표',
        id: '/biff-timetable/',
        start_url: '/biff-timetable/',
        scope: '/biff-timetable/',
        display: 'standalone',
        background_color: '#f1eee9',
        theme_color: '#f1eee9',
        lang: 'ko',
        orientation: 'portrait-primary',
        icons: [
          { src: 'app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: '/biff-timetable/index.html',
        navigateFallbackDenylist: [/\/screenings\.json/, /\/films-2026(?:\.meta)?\.json/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: '/biff-timetable/',
})
