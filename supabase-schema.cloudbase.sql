-- ============================================================
-- AI Chatbot · CloudBase PG 专用建表脚本（v2 · 修复版）
-- 环境：腾讯云 CloudBase x02-01（上海，PostgreSQL 17.10，兼容 Supabase）
-- 用法：控制台 → x02-01 → 数据库 → PostgreSQL → SQL 编辑器
--       【先清旧表，再建新表】一次性粘贴全部内容执行即可。
--
-- ⚠️ 与海外 Supabase 版相比，本脚本做了 4 处适配：
--   1) uuid_generate_v4()  → gen_random_uuid()（PG 13+ 内核函数，免装扩展）
--   2) 所有 user_id / created_by 字段从 UUID 改为 TEXT
--      （CloudBase 的 auth.uid() 返回 TEXT 类型，不是 UUID，
--       否则 RLS policy 里 auth.uid() = user_id 会报
--       operator does not exist: text = uuid）
--   3) 去掉所有 REFERENCES auth.users(...) 外键
--      （CloudBase 是否暴露 auth.users 表不确定）
--   4) handle_new_user 触发器单独隔离为【第 11 段·可选】，跑错就跳过
--      （应用层在设置页改名时会 upsert profiles，个人自用足够）
-- ============================================================


-- ---------- 【前置】清掉可能存在的旧表（上次用 UUID 类型的）----------
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.moments CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.memories CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.chat_themes CASCADE;


-- ---------- 【第 1 段】启用 pgcrypto（gen_random_uuid 兜底，可重复执行）----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------- 【第 2 段】profiles 用户资料 ----------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  chat_theme_id TEXT,
  voice_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公开查看资料" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "用户可更新自己的资料" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "用户可插入自己的资料" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ---------- 【第 3 段】conversations 对话 ----------
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  title TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可查看自己的对话" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "用户可创建对话" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可更新自己的对话" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);


-- ---------- 【第 4 段】messages 消息 ----------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'image')),
  voice_url TEXT,
  image_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可通过对话查看消息" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND user_id = auth.uid())
  );
CREATE POLICY "用户可在自己的对话中插入消息" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND user_id = auth.uid())
  );

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);


-- ---------- 【第 5 段】moments 朋友圈动态 ----------
CREATE TABLE public.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  ai_display_name TEXT DEFAULT 'AI',
  content TEXT,
  image_urls TEXT[],
  video_url TEXT,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  ai_post_slot TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所有人可查看动态" ON public.moments FOR SELECT USING (true);
CREATE POLICY "登录用户可发动态" ON public.moments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "作者可更新自己的动态" ON public.moments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "作者可删除自己的动态" ON public.moments
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_moments_created ON public.moments(created_at DESC);
CREATE INDEX idx_moments_user ON public.moments(user_id);


-- ---------- 【第 6 段】likes 点赞 ----------
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(moment_id, user_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "登录用户可点赞/取消赞" ON public.likes
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- ---------- 【第 7 段】comments 评论 ----------
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id TEXT,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所有人可查看评论" ON public.comments FOR SELECT USING (true);
CREATE POLICY "登录用户可评论" ON public.comments
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_comments_moment ON public.comments(moment_id, created_at);


-- ---------- 【第 8 段】memories AI 记忆 ----------
CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  memory_type TEXT DEFAULT 'preference'
    CHECK (memory_type IN ('preference', 'fact', 'event', 'summary')),
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  tags TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可管理自己的记忆" ON public.memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_memories_user ON public.memories(user_id, importance DESC);


-- ---------- 【第 9 段】user_settings 用户设置 ----------
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
  language TEXT DEFAULT 'zh-CN',
  voice_auto_play BOOLEAN DEFAULT FALSE,
  message_font_size INTEGER DEFAULT 16,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可管理自己的设置" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ---------- 【第 10 段】chat_themes 聊天主题 ----------
CREATE TABLE public.chat_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  background_url TEXT,
  character_gif_url TEXT,
  is_ai BOOLEAN DEFAULT FALSE,
  ai_personality TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公开查看主题" ON public.chat_themes FOR SELECT USING (is_public = true OR created_by = auth.uid());
CREATE POLICY "认证用户可创建主题" ON public.chat_themes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ---------- 【第 11 段·可选】注册自动建 profile 的触发器 ----------
-- ⚠️ 仅当 CloudBase PG 暴露 auth.users 表时才有效。
--    如果执行报错（提示 auth.users 不存在 / 没有权限 / 类型不对），直接跳过本段即可：
--    应用层在「设置→改名」时会 upsert profiles 行，个人自用不影响核心功能。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id::text, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 完成。8 张表 + RLS 策略 + 索引全部就绪。
-- 若第 11 段跳过，新用户首次登录后到「设置」里改一次昵称即可生成 profile 行。
-- 本脚本幂等：前置 DROP 保证可以反复执行不会报错。
-- ============================================================
