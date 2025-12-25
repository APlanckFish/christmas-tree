/**
 * Custom React Router v7 Server with WebSocket Support
 *
 * 使用纯 @react-router/node (无需 Express!)
 */

import { createRequestListener } from "@react-router/node";
import { WebSocketServer } from "ws";
import type { ServerBuild } from "react-router";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODE =
  process.env.NODE_ENV === "production" ? "production" : "development";
const BUILD_PATH = path.resolve(__dirname, "./build/server/index.js");

// 检查构建文件是否存在
if (!fs.existsSync(BUILD_PATH)) {
  console.error(`❌ Build file not found: ${BUILD_PATH}`);
  console.error(`   Current directory: ${__dirname}`);
  console.error(
    `   Build directory exists: ${fs.existsSync(path.resolve(__dirname, "./build"))}`
  );
  if (fs.existsSync(path.resolve(__dirname, "./build"))) {
    const buildContents = fs.readdirSync(path.resolve(__dirname, "./build"));
    console.error(`   Build directory contents: ${buildContents.join(", ")}`);
  }
  process.exit(1);
}

// 动态导入构建文件
const build = (await import(BUILD_PATH)) as ServerBuild;
console.log(`✅ Loaded build from: ${BUILD_PATH}`);

// 检查静态资源目录
const clientBuildPath = path.resolve(__dirname, "./build/client");
if (fs.existsSync(clientBuildPath)) {
  const clientFiles = fs.readdirSync(clientBuildPath);
  console.log(`✅ Client build directory exists: ${clientBuildPath}`);
  console.log(
    `   Client files: ${clientFiles.slice(0, 5).join(", ")}${clientFiles.length > 5 ? "..." : ""}`
  );
} else {
  console.warn(`⚠️  Client build directory not found: ${clientBuildPath}`);
}

// 创建 React Router 请求处理器 (纯 React Router v7，无 Express!)
// createRequestListener 会自动处理静态资源（build/client 目录）
const reactRouterHandler = createRequestListener({
  build,
  mode: MODE,
});

// 手动处理静态资源请求（在 React Router 处理之前）
// 因为 React Router 可能会将 /assets/ 路径匹配到 catch-all 路由
const requestListener: http.RequestListener = (req, res) => {
  const url = req.url || "/";

  // 处理静态资源请求（/assets/ 和 /public/）
  if (url.startsWith("/assets/") || url.startsWith("/public/")) {
    const filePath = url.startsWith("/assets/")
      ? path.join(clientBuildPath, url)
      : path.join(__dirname, "./public", url.replace("/public/", ""));

    // 检查文件是否存在
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
      };

      const contentType = mimeTypes[ext] || "application/octet-stream";

      try {
        const fileContent = fs.readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": fileContent.length,
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        res.end(fileContent);
        return;
      } catch (error) {
        console.error(`❌ Error reading static file ${filePath}:`, error);
        res.writeHead(500);
        res.end("Internal Server Error");
        return;
      }
    } else {
      // 文件不存在，继续交给 React Router 处理（可能会返回 404）
      console.warn(`⚠️  Static file not found: ${filePath}`);
    }
  }

  // 其他请求交给 React Router 处理
  return reactRouterHandler(req, res);
};

// HTTPS 配置：支持使用服务器证书
// 如果环境变量 SSL_KEY_PATH 和 SSL_CERT_PATH 为空，则不启用 HTTPS（由 Nginx 处理）
const getHttpsConfig = () => {
  // 如果环境变量明确设置为空，则不使用 HTTPS
  if (process.env.SSL_KEY_PATH === "" || process.env.SSL_CERT_PATH === "") {
    console.log("ℹ️  SSL disabled (handled by Nginx)");
    return null;
  }

  // 优先使用环境变量指定的证书路径（生产环境）
  const keyPath =
    process.env.SSL_KEY_PATH || path.resolve(__dirname, "./localhost-key.pem");
  const certPath =
    process.env.SSL_CERT_PATH || path.resolve(__dirname, "./localhost.pem");

  if (
    keyPath &&
    certPath &&
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath)
  ) {
    try {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
    } catch (error) {
      console.error("❌ Error reading SSL certificates:", error);
      return null;
    }
  }
  return null;
};

const httpsConfig = getHttpsConfig();

// 创建 HTTP/HTTPS 服务器
const server = httpsConfig
  ? https.createServer(httpsConfig, requestListener)
  : http.createServer(requestListener);

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ noServer: true });

// 房间管理
interface Room {
  id: string;
  clients: Set<any>;
}

const rooms = new Map<string, Room>();

// WebSocket 连接处理
wss.on("connection", (ws, request) => {
  console.log("🔗 New WebSocket connection");

  // 从 URL 获取房间ID
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const roomId = url.searchParams.get("room") || "default";

  // 加入房间
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, clients: new Set() });
  }
  const room = rooms.get(roomId)!;
  room.clients.add(ws);

  console.log(
    `📍 Client joined room: ${roomId} (${room.clients.size} clients)`
  );

  // 发送欢迎消息
  ws.send(
    JSON.stringify({
      type: "welcome",
      roomId,
      message: "Connected to Christmas Tree WebSocket",
    })
  );

  // 处理消息
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Message in room ${roomId}:`, data.type);

      // 广播给房间内其他客户端
      room.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error("❌ Error processing message:", error);
    }
  });

  // 处理断开连接
  ws.on("close", () => {
    room.clients.delete(ws);
    console.log(
      `👋 Client left room: ${roomId} (${room.clients.size} clients)`
    );

    // 清理空房间
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`🧹 Room ${roomId} deleted`);
    }
  });

  // 错误处理
  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

// 处理 WebSocket 升级请求
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);

  // 只处理 /ws 路径的升级请求
  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// 启动服务器（默认使用 8080，避免网络策略限制）
const PORT = parseInt(process.env.PORT || "8080", 10);
const protocol = httpsConfig ? "https" : "http";
const wsProtocol = httpsConfig ? "wss" : "ws";

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎄 Christmas Tree Server 🎄                            ║
║                                                           ║
║   Mode:       ${MODE.padEnd(44)}║
║   Protocol:   ${protocol.toUpperCase().padEnd(44)}║
║   HTTP:       ${protocol}://0.0.0.0:${PORT.toString().padEnd(33 - protocol.length)}║
║   WebSocket:  ${wsProtocol}://0.0.0.0:${PORT}/ws${" ".repeat(28 - wsProtocol.length)}║
║   SSL:        ${httpsConfig ? "✅ Enabled" : "❌ Disabled (HTTP only)"}${" ".repeat(httpsConfig ? 33 : 20)}║
║                                                           ║
║   Ready to spread Christmas joy! ✨                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
