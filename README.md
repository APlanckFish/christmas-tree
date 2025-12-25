# 🎄 圣诞树手势控制项目

基于 React Router v7 + TypeScript + Vite 的 3D 圣诞树手势控制项目。

## 功能特性

- ✨ Three.js 3D 圣诞树渲染
- 🎯 MediaPipe 手势识别
- 📱 手机摄像头串流控制（WebRTC）
- 🖼️ 照片上传与展示
- 🎵 背景音乐播放
- 🔐 HTTPS 支持（开发环境）

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置端口（可选）

创建 `.env` 文件配置端口（参考 `.env.example`）：

```bash
# HTTP 服务器端口（前端）
VITE_HTTP_PORT=8080

# WebSocket 服务器端口（信令服务器）
WS_PORT=8081
```

如果不配置，将使用默认端口：
- HTTP: `8080`
- WebSocket: `8081`

### 生成 HTTPS 证书（开发环境，推荐）

WebRTC 需要 HTTPS 环境（localhost 除外）：

```bash
chmod +x generate-cert.sh
./generate-cert.sh
```

首次访问需要信任证书：
- **Chrome/Edge**: 访问 `https://localhost:8080`，点击"高级" → "继续访问"
- **Safari**: 系统偏好设置 → 钥匙串访问 → 添加证书并信任

### 启动开发服务器

```bash
npm run dev
```

这将同时启动：
- React Router 开发服务器（默认端口 8080，可通过 `VITE_HTTP_PORT` 配置）
- WebSocket 服务器（默认端口 8081，可通过 `WS_PORT` 配置）

### 访问应用

- **PC 端**: 
  - HTTP: `http://localhost:8080`
  - HTTPS: `https://localhost:8080` (需要证书)
- **手机端**: 
  - 扫描 PC 端显示的二维码
  - 或访问: `http://[PC的IP]:8080/phone-camera?room=[房间ID]`

**注意**: 
- 手机和 PC 需要在同一局域网（开发环境）
- 如果使用 `localhost`，手机无法访问，请配置服务器 IP 地址

### 详细调试指南

查看 [本地调试指南.md](./本地调试指南.md) 获取完整的测试步骤和故障排除方法。

## 使用说明

1. **连接手机摄像头**
   - 点击页面底部的"连接手机摄像头"按钮
   - 扫描弹出的二维码
   - 在手机上允许摄像头权限

2. **手势控制**
   - **闭合拳头**: 恢复树形状（TREE 模式）
   - **张开手掌**: 粒子散开（SCATTER 模式）
   - **捏合拇指和食指**: 聚焦照片（FOCUS 模式）
   - **在 SCATTER 模式下移动手**: 控制树的旋转

3. **上传照片**
   - 点击"Add Memories"按钮
   - 选择图片文件上传
   - 照片会显示在圣诞树上

4. **隐藏/显示 UI**
   - 按 `H` 键隐藏/显示控制界面

## 项目结构

```
christmas/
├── app/
│   ├── components/        # React 组件
│   │   ├── ChristmasTree.tsx  # 3D 圣诞树组件
│   │   └── QRCodeGenerator.tsx
│   ├── hooks/            # React Hooks
│   │   └── useMediaPipe.ts    # MediaPipe 手势识别
│   ├── routes/           # 路由页面
│   │   ├── home.tsx      # 主页面
│   │   └── phone-camera.tsx  # 手机摄像头页面
│   └── services/         # 服务
│       └── WebRTCService.ts   # WebRTC 连接服务
├── old_version/          # 原项目参考代码
├── public/               # 静态资源
│   └── bgm.mp3          # 背景音乐
├── server.ts            # 生产环境服务器
├── ws-server.ts         # WebSocket 服务器
└── vite.config.ts       # Vite 配置
```

## 技术栈

- **前端框架**: React 18 + React Router v7
- **3D 渲染**: Three.js
- **手势识别**: MediaPipe Tasks Vision
- **视频串流**: WebRTC
- **信令服务器**: WebSocket
- **构建工具**: Vite
- **语言**: TypeScript

## 部署

### 生产环境构建

```bash
npm run build
npm start
```

### 环境要求

- Node.js 18+
- 支持 WebRTC 的现代浏览器
- HTTPS（生产环境必需，WebRTC 要求）

## 注意事项

1. **HTTPS 要求**: WebRTC 需要 HTTPS 环境（localhost 除外）
2. **摄像头权限**: 需要用户授权摄像头访问权限
3. **网络要求**: PC 和手机需要在同一网络（开发环境）或公网（生产环境）

## 开发说明

- 开发环境使用独立的 WebSocket 端口（3001）
- 生产环境 WebSocket 与 HTTP 使用相同端口
- 证书文件（`localhost-key.pem`, `localhost.pem`）已添加到 `.gitignore`

## 许可证

MIT

