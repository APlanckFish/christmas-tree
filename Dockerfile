# 多阶段构建：构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 安装依赖（生产环境需要 tsx 来运行 TypeScript）
COPY package*.json ./
RUN npm ci && npm cache clean --force

# 从构建阶段复制构建产物
# 注意：必须复制整个 build 目录（包含 build/client 和 build/server）
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./

# 验证构建产物（调试用，生产环境可删除）
RUN ls -la /app/build/ && \
    ls -la /app/build/client/ 2>/dev/null || echo "⚠️  build/client not found" && \
    ls -la /app/build/server/ 2>/dev/null || echo "⚠️  build/server not found"

# 创建证书目录（用于挂载服务器证书）
RUN mkdir -p /app/certs

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8080
ENV WS_PORT=8080

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用（使用 tsx 直接运行 TypeScript）
CMD ["node", "--import", "tsx/esm", "server.ts"]

