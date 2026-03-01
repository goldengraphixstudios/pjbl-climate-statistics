import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true
    },
    base: '/pjbl-climate-statistics/',
    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (!id)
                        return undefined;
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler') || id.includes('prop-types')) {
                            return 'vendor_react';
                        }
                        return 'vendor';
                    }
                    if (id.includes('/src/pages/') || id.includes('\\src\\pages\\')) {
                        var parts = id.split(/[/\\\\]/);
                        var idx = parts.lastIndexOf('pages');
                        if (idx >= 0 && parts.length > idx + 1) {
                            var section = parts[idx + 1];
                            var next = parts[idx + 2] || 'index';
                            var nextName = String(next).replace(/\.[^/.]+$/, '');
                            return "page-".concat(section, "-").concat(nextName);
                        }
                    }
                }
            }
        }
    }
});
