-- =============================================
-- AI Chatbot 数据库初始化脚本
-- 在Supabase SQL Editor中执行此文件
-- =============================================

-- 启用UUID扩展
create extension if not exists "uuid-ossp";

-- =============================================
-- 1. 用户资料表
-- =============================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  chat_theme_id uuid,
  voice_profile_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- =============================================
-- 2. 对话表
-- =============================================
create table if not exists conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  title text,
  is_archived boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table conversations enable row level security;
create policy "Users can manage their own conversations" on conversations for all using (auth.uid() = user_id);

-- =============================================
-- 3. 消息表
-- =============================================
create table if not exists messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references conversations on delete cascade not null,
  role text check (role in ('user', 'assistant', 'system')) not null,
  content text not null,
  message_type text check (message_type in ('text', 'voice', 'image')) default 'text',
  voice_url text,
  image_url text,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table messages enable row level security;
create policy "Users can access messages in their conversations" on messages for all using (
  conversation_id in (select id from conversations where user_id = auth.uid())
);

-- =============================================
-- 4. 朋友圈动态表
-- =============================================
create table if not exists moments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  content text,
  image_urls text[],
  video_url text,
  is_ai_generated boolean default false,
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table moments enable row level security;
create policy "Moments are viewable by everyone" on moments for select using (true);
create policy "Users can insert their own moments" on moments for insert with check (auth.uid() = user_id);
create policy "Users can update their own moments" on moments for update using (auth.uid() = user_id);
create policy "Users can delete their own moments" on moments for delete using (auth.uid() = user_id);

-- =============================================
-- 5. 评论表
-- =============================================
create table if not exists comments (
  id uuid default uuid_generate_v4() primary key,
  moment_id uuid references moments on delete cascade not null,
  user_id uuid references auth.users not null,
  content text not null,
  parent_id uuid references comments(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table comments enable row level security;
create policy "Comments are viewable by everyone" on comments for select using (true);
create policy "Users can insert their own comments" on comments for insert with check (auth.uid() = user_id);
create policy "Users can delete their own comments" on comments for delete using (auth.uid() = user_id);

-- =============================================
-- 6. 点赞表
-- =============================================
create table if not exists likes (
  id uuid default uuid_generate_v4() primary key,
  moment_id uuid references moments on delete cascade not null,
  user_id uuid references auth.users not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(moment_id, user_id)
);

alter table likes enable row level security;
create policy "Likes are viewable by everyone" on likes for select using (true);
create policy "Users can insert their own likes" on likes for insert with check (auth.uid() = user_id);
create policy "Users can delete their own likes" on likes for delete using (auth.uid() = user_id);

-- =============================================
-- 7. 语音配置表
-- =============================================
create table if not exists voice_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users,
  name text not null,
  voice_id text,
  is_cloned boolean default false,
  clone_audio_url text,
  sample_text text,
  is_public boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table voice_profiles enable row level security;
create policy "Public voices are viewable by everyone" on voice_profiles for select using (is_public = true or auth.uid() = user_id);
create policy "Users can insert their own voice profiles" on voice_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update their own voice profiles" on voice_profiles for update using (auth.uid() = user_id);
create policy "Users can delete their own voice profiles" on voice_profiles for delete using (auth.uid() = user_id);

-- =============================================
-- 8. 聊天主题表
-- =============================================
create table if not exists chat_themes (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  avatar_url text,
  background_url text,
  character_gif_url text,
  is_ai boolean default false,
  ai_personality text,
  is_public boolean default false,
  created_by uuid references auth.users,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table chat_themes enable row level security;
create policy "Public themes are viewable by everyone" on chat_themes for select using (is_public = true or auth.uid() = created_by);
create policy "Users can insert their own themes" on chat_themes for insert with check (auth.uid() = created_by);
create policy "Users can update their own themes" on chat_themes for update using (auth.uid() = created_by);
create policy "Users can delete their own themes" on chat_themes for delete using (auth.uid() = created_by);

-- =============================================
-- 9. 用户设置表
-- =============================================
create table if not exists user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null unique,
  theme text default 'light',
  language text default 'zh-CN',
  voice_auto_play boolean default false,
  message_font_size integer default 16,
  settings jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_settings enable row level security;
create policy "Users can view their own settings" on user_settings for select using (auth.uid() = user_id);
create policy "Users can insert their own settings" on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update their own settings" on user_settings for update using (auth.uid() = user_id);

-- =============================================
-- 10. 自动创建用户资料触发器
-- =============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- 11. 点赞数/评论数自动更新函数
-- =============================================
create or replace function increment_likes(moment_uuid uuid)
returns void
language plpgsql
as $$
begin
  update moments set likes_count = likes_count + 1 where id = moment_uuid;
end;
$$;

create or replace function decrement_likes(moment_uuid uuid)
returns void
language plpgsql
as $$
begin
  update moments set likes_count = GREATEST(0, likes_count - 1) where id = moment_uuid;
end;
$$;

create or replace function increment_comments(moment_uuid uuid)
returns void
language plpgsql
as $$
begin
  update moments set comments_count = comments_count + 1 where id = moment_uuid;
end;
$$;

-- =============================================
-- 12. Storage Buckets（需要在Supabase Dashboard手动创建）
-- =============================================
-- 需要创建以下Buckets:
-- 1. avatars  - 用户头像
-- 2. images   - 朋友圈图片
-- 3. voices   - 语音文件
-- 4. themes   - 主题资源（人物动图、背景图）

-- =============================================
-- 13. 插入默认聊天主题
-- =============================================
insert into chat_themes (name, description, is_ai, ai_personality, is_public) values
  ('默认助手', '温和友好的AI助手', true, '你是一个温和友好的AI助手，用简洁自然的语言回复用户。', true),
  ('理性分析师', '逻辑严密的理性派AI', true, '你是一个理性、直接、数据驱动的AI助手，正事专业简洁，闲聊轻松随意。', true),
  ('温柔陪伴', '温暖体贴的陪伴型AI', true, '你是一个温暖体贴的AI伴侣，善于倾听，给予鼓励和支持。', true)
on conflict do nothing;

-- =============================================
-- 完成提示
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '数据库初始化完成！请前往Supabase Dashboard创建Storage Buckets: avatars, images, voices, themes';
END $$;
