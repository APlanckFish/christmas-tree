/**
 * WebSocket API Route for React Router v7
 * 处理 WebRTC 信令服务器逻辑
 */

import type { LoaderFunctionArgs } from "react-router";
import { WebSocketServer, WebSocket } from "ws";

// 全局 WebSocket 服务器实例（仅在服务器端运行）
let wss: WebSocketServer | null = null;

// 房间管理
interface Room {
  id: string;
  clients: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

// 初始化 WebSocket 服务器
function initWebSocketServer() {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, request: any) => {
    console.log("🔗 New WebSocket connection");

    // 从 URL 获取房间ID
    const url = new URL(request.url, `http://${request.headers.host}`);
    const roomId = url.searchParams.get("room") || "default";

    // 加入房间
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { id: roomId, clients: new Set() });
    }
    const room = rooms.get(roomId)!;
    room.clients.add(ws);

    console.log(`📍 Client joined room: ${roomId} (${room.clients.size} clients)`);

    // 广播消息到房间内其他客户端
    ws.on("message", (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`📨 Message in room ${roomId}:`, data.type);

        // 转发给房间内的其他客户端
        room.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    });

    // 客户端断开连接
    ws.on("close", () => {
      room.clients.delete(ws);
      console.log(`👋 Client left room: ${roomId} (${room.clients.size} clients)`);

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

    // 发送欢迎消息
    ws.send(
      JSON.stringify({
        type: "welcome",
        roomId,
        message: "Connected to Christmas Tree WebSocket",
      })
    );
  });

  return wss;
}

/**
 * Loader 函数 - 处理 WebSocket 升级请求
 * 这是 React Router v7 处理 WebSocket 的方式
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // 检查是否为 WebSocket 升级请求
  const upgrade = request.headers.get("upgrade");

  if (upgrade?.toLowerCase() === "websocket") {
    // 初始化 WebSocket 服务器
    const server = initWebSocketServer();

    // 返回特殊响应，告诉 React Router 这是 WebSocket
    return new Response(null, {
      status: 101,
      statusText: "Switching Protocols",
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });
  }

  // 非 WebSocket 请求，返回 API 信息
  return Response.json({
    service: "Christmas Tree WebSocket API",
    version: "2.0",
    rooms: Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      clients: room.clients.size,
    })),
  });
}

// 导出 WebSocket 升级处理器（用于 server.ts）
export function handleWebSocketUpgrade(
  request: Request,
  socket: any,
  head: Buffer
) {
  const server = initWebSocketServer();

  if (server) {
    server.handleUpgrade(request as any, socket, head, (ws) => {
      server.emit("connection", ws, request);
    });
  }
}
