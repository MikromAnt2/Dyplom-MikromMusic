import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // Усі запити, що починаються з /api, будуть перенаправлені на бекенд
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                // Важливо для доступу по LAN IP (192.168.x.x):
                // не примушуємо Domain=localhost, інакше браузер на IP не відправляє session cookie.
                cookieDomainRewrite: '',
            },
            // Усі запити авторизації (наприклад, Google OAuth)
            '/auth': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            }
        }
    }
})