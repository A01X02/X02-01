# ============================================================
# 国内镜像容器构建文件（CloudBase 云托管 / 任意容器平台）
# 基于 Next.js standalone 输出，无需 Google 字体，国内可离线构建
# ============================================================

# ---------- 构建阶段 ----------
FROM node:18-alpine AS builder
WORKDIR /app

# 优先复制依赖清单，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码
COPY . .

# 声明国内部署模式（触发 standalone 输出 + 国内图片域名）
ENV NEXT_PUBLIC_DEPLOY_ENV=domestic
# 用中国大陆 npm 镜像加速（CloudBase 构建环境若在海外可删掉此行）
ENV npm_config_registry=https://registry.npmmirror.com

RUN npm run build

# ---------- 运行阶段 ----------
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV PORT=3000

# 复制 standalone 产物（含 server.js 与精简 node_modules）
COPY --from=builder /app/.next/standalone ./
# 静态资源与 public 必须放在 standalone 同级的对应目录
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
# CloudBase 云托管会注入 PORT 环境变量，这里兜底 3000
CMD ["node", "server.js"]
