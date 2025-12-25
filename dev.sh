#!/bin/bash

# 🎄 Christmas Tree - React Router v7 Development Script

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🎄 Christmas Tree - React Router v7 🎄                 ║"
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
echo "   Local:   http://localhost:3000"
echo "   Network: http://$IP:3000"
echo ""
echo "📱 For phone connection, use:"
echo "   http://$IP:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Starting development servers..."
echo ""

# 使用并发启动脚本
./dev-concurrent.sh
