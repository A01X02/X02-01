# 国内镜像部署指南（腾讯云 CloudBase + 自建 Supabase）

> 目标：在**不改动境外 Vercel + Supabase 版本**的前提下，做一套国内可直连的镜像。
> 本目录下的 `Dockerfile`、`cloudbase.json`、`env.domestic.example` 均为国内专属文件，
> 与现有境外部署互不干扰。

---

## 一、整体架构（国内镜像）

```
[ 你的手机/电脑（国内，免翻墙）]
        │
        ▼
[ 腾讯云 CloudBase 云托管 ]  ← 跑 Next.js 容器（本项目 Dockerfile）
        │  API 调用
        ▼
[ 国内 Supabase ]  ← 自建在轻量服务器上（Postgres + 登录 + 存储）
        │
   [ 火山 TTS / 豆包 ]  ← 本来就是国内服务，直接复用
```

⚠️ 关键：APP 能否在国内免翻墙打开，取决于**两个**海外依赖都被替换：
1. **部署平台** Vercel（海外）→ CloudBase 云托管（国内）
2. **数据库/登录** Supabase（海外）→ 国内自建 Supabase（见第二节）

只换平台、不换数据库，登录/朋友圈/记忆仍会连海外 Supabase，国内照样卡。

---

## 二、准备国内数据库（自建 Supabase，最兼容）

本项目用 Supabase 的 **登录(Auth) + 数据库 + 存储**，所以国内镜像需要一套
**Supabase 兼容后端**。Supabase 官方没有中国区，最稳的做法是在国内轻量服务器上**自建**。

### 1. 买一台国内轻量服务器
- 腾讯云「轻量应用服务器」2核2G 约 ¥50/月（或新用户首年更便宜）
- 系统选 **Ubuntu 22.04**，记得**备案**（用 CloudBase 子域名可暂缓，但服务器公网 IP 长期用建议备案）
- 开放端口：80、443，以及 Supabase 需要的 8000/5432/等（按官方文档）

### 2. 在服务器上装 Docker 后部署 Supabase
参考 Supabase 官方自托管文档（https://supabase.com/docs/self-hosting）：
```bash
# 服务器上执行
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# 按提示填 SECRET 等，然后：
docker compose up -d
```
启动后得到：
- API 地址：`http://<服务器公网IP>:8000`（生产建议套 HTTPS 域名）
- `anon key`、`service_role key`（在 `.env` 或 Studio 里查）

### 3. 建表
在 Supabase Studio（`:3000`）或 `psql` 里执行本项目根目录的
`supabase-schema.sql`，把聊天/朋友圈/记忆等表建到国内库。

---

## 三、部署 Next.js 到 CloudBase 云托管

### 方式 A：控制台（推荐，最简单）
1. 打开 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) → 「云托管」→ 新建服务
2. 关联你的 GitHub 仓库（或上传代码包），**构建方式选「Docker」**，Dockerfile 即本项目根目录的 `Dockerfile`
3. 「构建环境」里设置**构建环境变量**：
   - `NEXT_PUBLIC_DEPLOY_ENV=domestic`（必须，触发 standalone）
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（填**国内** Supabase 的值）
   - `DOUBAO_API_KEY` / `DOUBAO_API_ENDPOINT` / `DOUBAO_MODEL_ID`
   - `VOLC_TTS_*` 四个
   - （`NEXT_PUBLIC_*` 类变量同时要在「运行环境变量」再填一遍，因为 public 变量在构建时内联）
4. 部署完成后 CloudBase 会分配一个 `*.apigw.tencentcs.com` 子域名，**国内免备案可直接访问**
5. 如需自有域名，在「云托管」→「路径/域名」里绑定并备案

### 方式 B：CLI（可选）
```bash
npm i -g @cloudbase/cli
tcb login
tcb framework deploy   # 读取本仓库 cloudbase.json
```

---

## 四、本地用国内配置调试
```bash
cp env.domestic.example .env.local   # 填入国内真实值
export NEXT_PUBLIC_DEPLOY_ENV=domestic
npm run build && npm start           # standalone 产物，端口 3000
```

---

## 五、和境外版本的关系
| 项目 | 境外（现有，不动） | 国内镜像（新增） |
|------|------|------|
| 平台 | Vercel | CloudBase 云托管 |
| 数据库 | Supabase（海外） | 自建 Supabase（国内服务器） |
| AI/语音 | 豆包 + 火山 | 同左（本就是国内服务） |
| 配置来源 | `.env.local`（现有） | `env.domestic.example` |
| 构建产物 | Vercel 默认 | `Dockerfile` + `output:standalone` |

两边代码是**同一套**，只靠环境变量切换，改功能只需改一处。
