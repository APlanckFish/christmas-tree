import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import path from "path";
import fs from "fs";

// HTTPS 配置（WebRTC 需要 HTTPS，如果证书存在则自动启用）
const httpsConfig = (() => {
  const keyPath = path.resolve(__dirname, "./localhost-key.pem");
  const certPath = path.resolve(__dirname, "./localhost.pem");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log("✅ HTTPS enabled (certificates found)");
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  console.warn(
    "⚠️  HTTPS certificates not found. Run ./generate-cert.sh to generate them."
  );
  console.warn("⚠️  WebRTC requires HTTPS. Please generate certificates.");
  return undefined;
})();

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },
  server: {
    host: "0.0.0.0", // 监听所有网络接口，允许局域网访问
    port: parseInt(process.env.VITE_HTTP_PORT || "8080", 10), // 默认 8080，可通过环境变量配置
    https: httpsConfig, // 启用 HTTPS（如果证书存在，WebRTC 需要）
    strictPort: false,
  },
});
