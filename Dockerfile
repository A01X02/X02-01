# ============================================================
# 国内镜像容器构建文件（CloudBase 云托管 / 任意容器平台）
# 基于 Next.js standalone 输出，无需 Google 字体，国内可离线构建
#
# ⚠️ 关键：所有 NEXT_PUBLIC_* 变量在「构建时」就烧进前端，
#    必须用 ARG 传入，否则国内版前端拿不到环境信息 → 白屏。
#    下面带默认值的（domestic / x02-01 / ap-shanghai）可直接用；
#    ACCESS_KEY 和 SITE_URL 是你专属的，CloudBase 构建环境变量里填，
#    或本地构建时传入：--build-arg NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY=xxx
# ============================================================

# ---------- 构建阶段 ----------
FROM node:18-alpine AS builder
WORKDIR /app

# 国内构建参数（CloudBase 构建环境变量会作为 build-arg 注入；此处给默认值兜底）
ARG NEXT_PUBLIC_DEPLOY_ENV=domestic
ARG NEXT_PUBLIC_CLOUDBASE_ENV_ID=x02-01
ARG NEXT_PUBLIC_CLOUDBASE_REGION=ap-shanghai
ARG NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY
ARG NEXT_PUBLIC_SITE_URL

# 把这些 ARG 显式声明为 ENV，Next.js 构建时才能读取到
ENV NEXT_PUBLIC_DEPLOY_ENV=$NEXT_PUBLIC_DEPLOY_ENV
ENV NEXT_PUBLIC_CLOUDBASE_ENV_ID=$NEXT_PUBLIC_CLOUDBASE_ENV_ID
ENV NEXT_PUBLIC_CLOUDBASE_REGION=$NEXT_PUBLIC_CLOUDBASE_REGION
ENV NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY=$NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# 优先复制依赖清单，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码
COPY . .

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
