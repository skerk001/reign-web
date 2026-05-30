import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Emits bundle-stats.html (project root, gitignored — not deployed) after each
    // build: an interactive treemap of what each chunk contains. Run `npm run build`
    // then open bundle-stats.html.
    visualizer({ filename: 'bundle-stats.html', gzipSize: true, brotliSize: true }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep React in its own content-hashed chunk so app-code changes don't
        // bust its cache for returning visitors on every deploy. Targeted on
        // purpose: recharts & friends stay in their own lazy chunks (e.g. Viz),
        // so they're not dragged onto the landing page.
        manualChunks(id) {
          if (
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
})
