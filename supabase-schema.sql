-- ============================================================
-- AI Chatbot 数据库 Schema（幂等版，可重复执行）
-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 用户资料 profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "公开查看资料" ON public.profiles;
CREATE POLICY "公开查看资料" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "用户可更新自己的资料" ON public.profiles;
CREATE POLICY "用户可更新自己的资料" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "用户可插入自己的资料" ON public.profiles;
CREATE POLICY "用户可插入自己的资料" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 自动创建 profile 的触发器（用户注册时）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. 对话 conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户可查看自己的对话" ON public.conversations;
CREATE POLICY "用户可查看自己的对话" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "用户可创建对话" ON public.conversations;
CREATE POLICY "用户可创建对话" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "用户可更新自己的对话" ON public.conversations;
CREATE POLICY "用户可更新自己的对话" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 3. 消息 messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

DROP POLICY IF EXISTS "用户可通过对话查看消息" ON public.messages;
CREATE POLICY "用户可通过对话查看消息" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "用户可在自己的对话中插入消息" ON public.messages;
CREATE POLICY "用户可在自己的对话中插入消息" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);

-- ============================================================
-- 4. 朋友圈动态 moments（核心表）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- 用户发的（可为NULL=AI系统发）
  ai_display_name TEXT DEFAULT 'AI',                           -- AI帖子的显示名称
  content TEXT,
  image_urls TEXT[],       -- 图片URL数组
  video_url TEXT,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  ai_post_slot TEXT,       -- 'morning' | 'evening' | null(手动发布)
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有人可查看动态" ON public.moments;
CREATE POLICY "所有人可查看动态" ON public.moments FOR SELECT USING (true);
DROP POLICY IF EXISTS "登录用户可发动态" ON public.moments;
CREATE POLICY "登录用户可发动态" ON public.moments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "作者可更新自己的动态" ON public.moments;
CREATE POLICY "作者可更新自己的动态" ON public.moments
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "作者可删除自己的动态" ON public.moments;
CREATE POLICY "作者可删除自己的动态" ON public.moments
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_moments_created ON public.moments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_user ON public.moments(user_id);

-- ============================================================
-- 5. 点赞 likes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moment_id UUID REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(moment_id, user_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "登录用户可点赞/取消赞" ON public.likes;
CREATE POLICY "登录用户可点赞/取消赞" ON public.likes
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. 评论 comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moment_id UUID REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有人可查看评论" ON public.comments;
CREATE POLICY "所有人可查看评论" ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "登录用户可评论" ON public.comments;
CREATE POLICY "登录用户可评论" ON public.comments
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_comments_moment ON public.comments(moment_id, created_at);

-- ============================================================
-- 7. 记忆 memories（AI记忆系统）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "用户可管理自己的记忆" ON public.memories;
CREATE POLICY "用户可管理自己的记忆" ON public.memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_memories_user ON public.memories(user_id, importance DESC);

-- ============================================================
-- 8. 用户设置 user_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
  language TEXT DEFAULT 'zh-CN',
  voice_auto_play BOOLEAN DEFAULT FALSE,
  message_font_size INTEGER DEFAULT 16,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户可管理自己的设置" ON public.user_settings;
CREATE POLICY "用户可管理自己的设置" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 9. 聊天主题 chat_themes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  background_url TEXT,
  character_gif_url TEXT,
  is_ai BOOLEAN DEFAULT FALSE,
  ai_personality TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "公开查看主题" ON public.chat_themes;
CREATE POLICY "公开查看主题" ON public.chat_themes FOR SELECT USING (is_public = true OR created_by = auth.uid());
DROP POLICY IF EXISTS "认证用户可创建主题" ON public.chat_themes;
CREATE POLICY "认证用户可创建主题" ON public.chat_themes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 10. 语音配置 voice_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  voice_id TEXT,
  is_cloned BOOLEAN DEFAULT FALSE,
  clone_audio_url TEXT,
  sample_text TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户可管理自己的语音" ON public.voice_profiles;
CREATE POLICY "用户可管理自己的语音" ON public.voice_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 完成提示
-- ============================================================
-- 执行后，朋友圈页面将不再报错（会显示空状态「还没有动态」）
-- 后续通过 /api/auto-post 接口或手动发圈来填充数据
-- 本文件为幂等版本，可安全重复执行
-- ============================================================
