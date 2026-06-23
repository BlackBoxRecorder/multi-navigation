import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/main-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    define: {
      __AMAP_KEY__: JSON.stringify(env.VITE_AMAP_KEY || ''),
      __AMAP_SECURITY_CODE__: JSON.stringify(env.VITE_AMAP_SECURITY_CODE || ''),
    },
  };
});
