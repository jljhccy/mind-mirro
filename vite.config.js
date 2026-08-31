import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 构建时间(北京时间),注入到页面用于确认手机上跑的是哪一版
const buildStamp = new Date(Date.now() + 8 * 3600 * 1000)
  .toISOString()
  .slice(0, 16)
  .replace('T', ' ')

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildStamp)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '念镜',
        short_name: '念镜',
        description: '一面照见念头的镜子',
        theme_color: '#faf9f7',
        background_color: '#faf9f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']
      }
    })
  ]
})
