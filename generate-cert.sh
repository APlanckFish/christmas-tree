#!/bin/bash

# 生成自签名证书用于本地 HTTPS 开发

DAYS=365

echo "🔐 Generating self-signed certificate for HTTPS development..."

# 生成私钥和证书 (直接放在项目根目录,与 vite.config.ts 中的路径匹配)
openssl req -x509 -newkey rsa:2048 -nodes \
  -sha256 \
  -days $DAYS \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -subj "/C=CN/ST=State/L=City/O=Development/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1,IP:0.0.0.0"

echo "✅ Certificate generated successfully!"
echo "   - Certificate: localhost.pem"
echo "   - Private key: localhost-key.pem"
echo ""
echo "⚠️  You need to trust this certificate in your browser and phone."
echo "   - Chrome: Visit https://localhost:5173 and click 'Advanced' -> 'Proceed'"
echo "   - Safari iOS: Settings -> General -> About -> Certificate Trust Settings"
echo ""
echo "📝 Note: Add localhost-key.pem and localhost.pem to .gitignore"
