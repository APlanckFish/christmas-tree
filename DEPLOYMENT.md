# 🚀 部署指南

本文档提供完整的生产环境部署流程，支持使用服务器自带的 SSL 证书。

## 📋 前置要求

- Docker 和 Docker Compose 已安装
- 服务器证书文件（key.pem 和 cert.pem，或 Let's Encrypt 证书）
- 服务器开放相应端口（默认 8080）

## 🔐 证书准备

### 方式一：使用现有证书

如果你已有 SSL 证书文件：

```bash
# 创建证书目录
sudo mkdir -p /opt/christmas-tree/certs

# 复制证书文件（请根据实际情况修改路径）
sudo cp /path/to/your/key.pem /opt/christmas-tree/certs/
sudo cp /path/to/your/cert.pem /opt/christmas-tree/certs/

# 设置权限
sudo chmod 600 /opt/christmas-tree/certs/*.pem
sudo chown -R $USER:$USER /opt/christmas-tree/certs
```

### 方式二：使用 Let's Encrypt 证书

如果使用 Let's Encrypt（推荐）：

```bash
# 安装 certbot（如果未安装）
sudo apt-get update
sudo apt-get install certbot

# 获取证书（替换 yourdomain.com 为你的域名）
sudo certbot certonly --standalone -d yourdomain.com

# 创建证书目录
sudo mkdir -p /opt/christmas-tree/certs

# 复制证书文件
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/christmas-tree/certs/key.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/christmas-tree/certs/cert.pem

# 设置权限
sudo chmod 600 /opt/christmas-tree/certs/*.pem
sudo chown -R $USER:$USER /opt/christmas-tree/certs
```

**注意**：Let's Encrypt 证书每 90 天需要续期。可以设置自动续期：

```bash
# 编辑续期脚本
sudo nano /etc/cron.monthly/renew-christmas-cert.sh
```

```bash
#!/bin/bash
certbot renew --quiet
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/christmas-tree/certs/key.pem
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/christmas-tree/certs/cert.pem
docker-compose -f /opt/christmas-tree/docker-compose.yml restart christmas-tree
```

```bash
sudo chmod +x /etc/cron.monthly/renew-christmas-cert.sh
```

## 🐳 Docker 部署

### 1. 准备项目文件

```bash
# 克隆或上传项目到服务器
cd /opt
git clone <your-repo-url> christmas-tree
# 或使用 scp 上传项目文件
```

### 2. 配置 docker-compose.yml

编辑 `docker-compose.yml`，修改证书挂载路径：

```yaml
volumes:
  # 使用现有证书
  - /opt/christmas-tree/certs:/app/certs:ro

  # 或直接使用 Let's Encrypt 证书（推荐，自动更新）
  # - /etc/letsencrypt/live/yourdomain.com:/app/certs:ro
```

### 3. 配置环境变量（可选）

创建 `.env` 文件（可选，docker-compose.yml 中已设置默认值）：

```bash
cd /opt/christmas-tree
cat > .env << EOF
HTTP_PORT=8080
NODE_ENV=production
SSL_KEY_PATH=/app/certs/key.pem
SSL_CERT_PATH=/app/certs/cert.pem
EOF
```

### 4. 构建和启动

```bash
cd /opt/christmas-tree

# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 5. 验证部署

```bash
# 检查容器状态
docker-compose ps

# 检查健康状态
curl -k https://localhost:8080

# 查看日志
docker-compose logs christmas-tree
```

## 🔧 使用 Nginx 反向代理（推荐）

使用 Nginx 作为反向代理可以更好地处理 SSL 和负载均衡：

### 1. 安装 Nginx

```bash
sudo apt-get update
sudo apt-get install nginx
```

### 2. 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/christmas-tree`：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL 优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 日志
    access_log /var/log/nginx/christmas-tree-access.log;
    error_log /var/log/nginx/christmas-tree-error.log;

    # WebSocket 升级支持
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # 静态文件和 API
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
```

### 3. 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/christmas-tree /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 4. 修改 docker-compose.yml

如果使用 Nginx 反向代理，容器不需要直接暴露 HTTPS，可以只使用 HTTP：

```yaml
services:
  christmas-tree:
    # ... 其他配置 ...
    ports:
      - "127.0.0.1:8080:8080" # 只监听本地，由 Nginx 处理 HTTPS
    environment:
      - SSL_KEY_PATH= # 留空，不使用容器内证书
      - SSL_CERT_PATH= # 留空，不使用容器内证书
```

## 🔄 更新和维护

### 更新应用

```bash
cd /opt/christmas-tree

# 拉取最新代码
git pull

# 重新构建
docker-compose build

# 重启服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 查看日志

```bash
# 实时日志
docker-compose logs -f christmas-tree

# 最近 100 行日志
docker-compose logs --tail=100 christmas-tree
```

### 停止服务

```bash
docker-compose down
```

### 重启服务

```bash
docker-compose restart
```

## 🔍 故障排查

### 1. 容器无法启动

```bash
# 查看详细错误
docker-compose logs christmas-tree

# 检查端口占用
sudo netstat -tlnp | grep 8080

# 检查证书文件
ls -la /opt/christmas-tree/certs/
```

### 2. SSL 证书问题

```bash
# 检查证书文件是否存在
ls -la /opt/christmas-tree/certs/

# 检查证书权限
ls -l /opt/christmas-tree/certs/*.pem

# 验证证书内容
openssl x509 -in /opt/christmas-tree/certs/cert.pem -text -noout
```

### 3. WebSocket 连接失败

- 检查防火墙是否开放端口
- 检查 Nginx 配置中的 WebSocket 升级设置
- 查看浏览器控制台错误信息

### 4. 性能优化

```bash
# 查看容器资源使用
docker stats christmas-tree

# 限制资源使用（在 docker-compose.yml 中添加）
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 512M
```

## 📝 环境变量说明

| 变量名          | 说明                           | 默认值                |
| --------------- | ------------------------------ | --------------------- |
| `NODE_ENV`      | 运行环境                       | `production`          |
| `PORT`          | HTTP/HTTPS 端口                | `8080`                |
| `WS_PORT`       | WebSocket 端口（与 PORT 相同） | `8080`                |
| `SSL_KEY_PATH`  | SSL 私钥路径                   | `/app/certs/key.pem`  |
| `SSL_CERT_PATH` | SSL 证书路径                   | `/app/certs/cert.pem` |

## 🔒 安全建议

1. **防火墙配置**：只开放必要端口
2. **定期更新**：保持 Docker 镜像和依赖更新
3. **证书续期**：设置 Let's Encrypt 自动续期
4. **日志监控**：定期检查日志文件
5. **备份**：定期备份证书和配置

## 📞 支持

如遇问题，请检查：

1. Docker 和 Docker Compose 版本
2. 证书文件路径和权限
3. 端口是否被占用
4. 防火墙规则
5. 应用日志
