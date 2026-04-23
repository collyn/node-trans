import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: "client",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3333",
      "/socket.io": {
        target: "http://localhost:3333",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: "client/index.html",
        overlay: "client/overlay.html",
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/socket.io-client")) {
            return "vendor-socketio";
          }
        },
      },
    },
  },
});
