#!/bin/bash

# 🎄 Christmas Tree - Concurrent Development Script
# 同时启动 WebSocket 服务器和 Vite 开发服务器

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🎄 Christmas Tree - Development Mode 🎄                ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检测本地IP
echo "🔍 Detecting local IP addresses..."
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    IP=$(hostname -I | awk '{print $1}')
else
    # Windows (Git Bash)
    IP=$(ipconfig | grep "IPv4" | head -n 1 | awk '{print $NF}')
fi

echo "📡 Your local IP address: $IP"
echo ""
echo "🌐 Access URLs:"
echo "   Local:   http://localhost:5173"
echo "   Network: http://$IP:5173"
echo ""
echo "📱 For phone connection, use:"
echo "   http://$IP:5173/phone-camera?room=xxx"
echo ""
echo "🔌 WebSocket Server:"
echo "   ws://localhost:3001/ws"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $WS_PID $VITE_PID 2>/dev/null
    exit
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 启动 WebSocket 服务器
echo "🔌 Starting WebSocket Server (port 3001)..."
npx tsx ws-server.ts &
WS_PID=$!

# 等待一下
sleep 2

# 启动 Vite 开发服务器
echo "⚡ Starting Vite Dev Server (port 5173)..."
npx react-router dev &
VITE_PID=$!

echo ""
echo "✅ Both servers are running!"
echo ""
echo "Press Ctrl+C to stop all servers."
echo ""

# 等待进程
wait
