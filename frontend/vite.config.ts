import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command, mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), "");
  console.log(env.VITE_API_URL);
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        ".nglocalhost.com",
        ".ngrok.io",
        ".localtunnel.me",
      ],
      proxy: {
        "/api": {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
