# AI Chatbot - 智能聊天机器人

基于豆包seed的智能聊天机器人，支持语音对话和朋友圈功能。界面采用微信聊天框样式，配色为低饱和度橙色和灰色。

## 功能特性

- 💬 **智能聊天** - 对接豆包seed模型，拟人化对话体验
- 📱 **朋友圈** - AI和用户双向发布动态，评论点赞互动
- 🎤 **语音对话** - 支持语音消息和语音克隆
- 🎨 **个性化** - 可更换聊天主题（人物动图）和头像
- 📱 **移动优先** - 手机端优化，微信聊天框样式

## 技术栈

| 分类 | 技术 |
|------|------|
| 前端框架 | Next.js 14 (App Router) + TypeScript |
| UI样式 | Tailwind CSS |
| 数据库 | Supabase (PostgreSQL + Auth + Storage) |
| 部署 | Vercel |
| AI模型 | 豆包seed API |

## 快速开始

### 1. 安装依赖

```bash
cd E:\Games\AI_Project_chatbot
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 为 `.env.local`，填入你的配置：

```bash
cp .env.local.example .env.local
```

需要配置：
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase项目URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase服务端密钥
- `DOUBAO_API_KEY` - 豆包seed API密钥

### 3. 初始化Supabase数据库

1. 登录 [Supabase Dashboard](https://supabase.com)
2. 创建新项目
3. 进入 SQL Editor
4. 执行 `supabase/migrations/init.sql` 文件中的SQL
5. 在 Storage 中创建以下Buckets：
   - `avatars` - 用户头像
   - `images` - 朋友圈图片
   - `voices` - 语音文件
   - `themes` - 主题资源

### 4. 运行开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 5. 部署到Vercel

1. 将代码推送到GitHub
2. 在 [Vercel](https://vercel.com) 导入仓库
3. 配置环境变量（同 `.env.local`）
4. 部署

## 配色方案

| 颜色 | 色值 | 用途 |
|------|------|------|
| 主橙色 | #E8A87C | 用户消息气泡、强调色 |
| 深橙色 | #D4845A | 按钮悬停状态 |
| 浅橙色 | #F5D5C0 | AI标记背景 |
| 深灰色 | #2C3E50 | 主文字 |
| 中灰色 | #95A5A6 | 辅助文字 |
| 浅灰色 | #ECF0F1 | AI消息气泡 |
| 背景灰 | #F5F5F5 | 页面背景 |

## 项目结构

```
ai-chatbot/
├── src/
│   ├── app/
│   │   ├── (main)/          # 主功能页面
│   │   │   ├── chat/        # 聊天界面
│   │   │   ├── moments/     # 朋友圈
│   │   │   ├── profile/     # 个人资料
│   │   │   └── settings/    # 设置
│   │   ├── api/             # API路由
│   │   │   ├── chat/        # 聊天API
│   │   │   ├── moments/     # 朋友圈API
│   │   │   ├── voice/       # 语音API
│   │   │   └── upload/      # 文件上传API
│   │   ├── globals.css      # 全局样式
│   │   ├── layout.tsx       # 根布局
│   │   └── page.tsx         # 首页（重定向到聊天）
│   ├── components/           # 可复用组件
│   │   ├── chat/            # 聊天组件
│   │   ├── moments/         # 朋友圈组件
│   │   ├── settings/        # 设置组件
│   │   └── ui/              # 基础UI组件
│   ├── lib/                 # 工具函数
│   │   ├── supabase.ts      # Supabase客户端
│   │   └── config.ts        # 配置
│   └── types/               # TypeScript类型
├── supabase/
│   └── migrations/
│       └── init.sql         # 数据库初始化SQL
├── .env.local.example       # 环境变量示例
├── tailwind.config.js       # Tailwind配置
├── tsconfig.json            # TypeScript配置
└── package.json             # 依赖配置
```

## 豆包seed API对接

1. 前往[火山引擎](https://www.volcengine.com)注册账号
2. 开通豆包大模型服务
3. 获取API Key
4. 填入 `.env.local` 中的 `DOUBAO_API_KEY`
5. 在 `src/app/api/chat/route.ts` 中替换模型ID

## 语音服务对接

语音服务支持多种选择，在 `.env.local` 中配置对应服务商的密钥：

- 腾讯云语音（推荐，支持声音克隆）
- 阿里云语音
- 百度语音

## License

MIT
