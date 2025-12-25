/**
 * Standalone WebSocket Server for Development
 * 独立的 WebSocket 服务器（用于开发环境）
 */

import { WebSocketServer } from "ws";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ES 模块中获取 __dirname 的替代方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从环境变量读取端口，默认使用 8081（避免网络策略限制）
const WS_PORT = parseInt(process.env.WS_PORT || "8081", 10);

// 房间管理
interface Room {
  id: string;
  clients: Set<any>;
}

const rooms = new Map<string, Room>();

// HTTPS 配置（使用与 Vite 相同的证书，支持 WSS）
// WebRTC 需要 HTTPS，所以 WebSocket 服务器也应该支持 WSS
const keyPath = path.resolve(__dirname, './localhost-key.pem');
const certPath = path.resolve(__dirname, './localhost.pem');

let server: http.Server | https.Server;

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  // 使用 HTTPS 支持 WSS（与 Vite 使用相同的证书）
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  server = https.createServer(httpsOptions, (req, res) => {
    res.writeHead(200);
    res.end("WebSocket Server (WSS)");
  });
  console.log('✅ WebSocket server using WSS (HTTPS)');
} else {
  // 回退到 HTTP (WS) - 不推荐，WebRTC 需要 HTTPS
  server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("WebSocket Server (WS)");
  });
  console.warn('⚠️  HTTPS certificates not found. WebSocket server using WS (HTTP).');
  console.warn('⚠️  WebRTC requires HTTPS. Please run ./generate-cert.sh to generate certificates.');
}

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ 
  server,
  // 允许自签名证书
  verifyClient: (info) => {
    console.log("🔍 WebSocket connection attempt from:", info.origin || info.req.headers.origin || 'unknown');
    return true;
  }
});

// 监听升级请求（用于调试）
server.on('upgrade', (request, socket, head) => {
  console.log("⬆️  HTTP upgrade request:", request.url);
  console.log("⬆️  Headers:", request.headers);
});

// WebSocket 连接处理
wss.on("connection", (ws, request) => {
  const clientIP = request.socket.remoteAddress;
  console.log("🔗 New WebSocket connection from:", clientIP);

  let roomId: string = "default";
  let room: Room | null = null;

  try {
    // 从 URL 获取房间ID
    // 注意：对于 HTTPS/WSS，需要使用 https:// 协议
    const protocol = request.secure ? 'https' : 'http';
    const url = new URL(request.url!, `${protocol}://${request.headers.host}`);
    roomId = url.searchParams.get("room") || "default";

    // 加入房间
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { id: roomId, clients: new Set() });
    }
    room = rooms.get(roomId)!;
    room.clients.add(ws);

    console.log(`📍 Client joined room: ${roomId} (${room.clients.size} clients)`);

    // 发送欢迎消息
    try {
      ws.send(
        JSON.stringify({
          type: "welcome",
          roomId,
          message: "Connected to Christmas Tree WebSocket",
        })
      );
    } catch (error) {
      console.error("❌ Error sending welcome message:", error);
    }
  } catch (error) {
    console.error("❌ Error handling connection:", error);
    ws.close(1011, "Server error");
    return;
  }

  // 处理消息
  ws.on("message", (message) => {
    if (!room) return;
    
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
  ws.on("close", (code, reason) => {
    if (room) {
      room.clients.delete(ws);
      console.log(`👋 Client left room ${roomId} (code: ${code}, reason: ${reason.toString()}, remaining: ${room.clients.size})`);

      // 清理空房间
      if (room.clients.size === 0) {
        rooms.delete(roomId);
        console.log(`🧹 Room ${roomId} deleted`);
      }
    }
  });

  // 错误处理
  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
    console.error("❌ Error details:", error.message);
  });
});

// 服务器错误处理
server.on('error', (error: any) => {
  console.error("❌ Server error:", error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${WS_PORT} is already in use`);
  }
});

wss.on('error', (error) => {
  console.error("❌ WebSocket Server error:", error);
});

// 启动服务器
server.listen(WS_PORT, '0.0.0.0', () => {
  const protocol = fs.existsSync(keyPath) && fs.existsSync(certPath) ? 'wss' : 'ws';
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔌 WebSocket Server Running                            ║
║                                                           ║
║   Port:       ${WS_PORT.toString().padEnd(48)}║
║   Endpoint:   ${protocol}://0.0.0.0:${WS_PORT}${" ".repeat(28 - protocol.length)}║
║   Status:     Accepting connections from all interfaces  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
