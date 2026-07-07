-- =============================================
-- 长期记忆系统 - 数据库升级脚本
-- 在Supabase SQL Editor中执行此文件
-- =============================================

-- =============================================
-- 1. 记忆表
-- =============================================
create table if not exists memories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  conversation_id uuid references conversations on delete set null,
  
  -- 记忆内容
  content text not null,           -- 记忆内容描述
  memory_type text not null check (memory_type in (
    'preference',    -- 用户偏好（喜欢/不喜欢什么）
    'fact',          -- 个人事实（工作、兴趣等）
    'event',         -- 重要事件
    'summary'        -- 对话摘要
  )),
  
  -- 元数据
  importance integer default 5,    -- 重要程度 1-10
  tags text[] default '{}',        -- 标签（用于关键词检索）
  source_message_id uuid,          -- 来源消息ID
  
  -- 状态
  is_active boolean default true,  -- 是否活跃（软删除）
  access_count integer default 0,  -- 被检索次数
  last_accessed_at timestamp with time zone, -- 最后检索时间
  
  -- 时间戳
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 创建索引（加速检索）
create index if not exists idx_memories_user_id on memories(user_id);
create index if not exists idx_memories_type on memories(memory_type);
create index if not exists idx_memories_tags on memories using gin(tags);
create index if not exists idx_memories_active on memories(user_id, is_active) where is_active = true;
create index if not exists idx_memories_importance on memories(user_id, importance desc);

-- RLS策略
alter table memories enable row level security;

create policy "Users can view their own memories" 
  on memories for select using (auth.uid() = user_id);
  
create policy "Users can insert their own memories" 
  on memories for insert with check (auth.uid() = user_id);
  
create policy "Users can update their own memories" 
  on memories for update using (auth.uid() = user_id);
  
create policy "Users can delete their own memories" 
  on memories for delete using (auth.uid() = user_id);

-- =============================================
-- 2. 对话摘要表
-- =============================================
create table if not exists conversation_summaries (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references conversations on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  
  summary text not null,                 -- 摘要内容
  message_range_start uuid,              -- 涵盖的起始消息ID
  message_range_end uuid,                -- 涵盖的结束消息ID
  message_count integer default 0,       -- 涵盖的消息数量
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table conversation_summaries enable row level security;

create policy "Users can view their own summaries" 
  on conversation_summaries for select using (auth.uid() = user_id);
  
create policy "Users can insert their own summaries" 
  on conversation_summaries for insert with check (auth.uid() = user_id);
  
create policy "Users can delete their own summaries" 
  on conversation_summaries for delete using (auth.uid() = user_id);

-- =============================================
-- 3. 记忆检索函数
--    根据关键词和重要程度检索相关记忆
-- =============================================
create or replace function search_memories(
  p_user_id uuid,
  p_keywords text[] default '{}',
  p_limit integer default 10
)
returns table(
  id uuid,
  content text,
  memory_type text,
  importance integer,
  tags text[],
  access_count integer,
  created_at timestamp with time zone,
  relevance_score float
)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  select 
    m.id,
    m.content,
    m.memory_type,
    m.importance,
    m.tags,
    m.access_count,
    m.created_at,
    -- 相关性评分 = 重要程度 + 标签匹配数 + 时间衰减
    (
      m.importance * 0.4 +
      coalesce(array_length(array(
        select unnest(m.tags) 
        intersect 
        select unnest(p_keywords)
      ), 1), 0) * 3.0 +
      -- 30天内的时间加权
      case 
        when m.created_at > now() - interval '7 days' then 3.0
        when m.created_at > now() - interval '30 days' then 2.0
        when m.created_at > now() - interval '90 days' then 1.0
        else 0.5
      end
    ) as relevance_score
  from memories m
  where m.user_id = p_user_id
    and m.is_active = true
    and (
      p_keywords = '{}' or 
      m.tags && p_keywords or
      m.content ilike '%' || array_to_string(p_keywords, '%') || '%'
    )
  order by relevance_score desc, m.importance desc
  limit p_limit;
end;
$$;

-- =============================================
-- 4. 更新记忆访问计数函数
-- =============================================
create or replace function touch_memory(p_memory_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update memories 
  set 
    access_count = access_count + 1,
    last_accessed_at = now()
  where id = p_memory_id;
end;
$$;

-- =============================================
-- 5. 自动更新 updated_at 触发器
-- =============================================
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trigger_memories_updated on memories;
create trigger trigger_memories_updated
  before update on memories
  for each row execute procedure update_updated_at();

-- =============================================
-- 完成提示
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '记忆系统数据库升级完成！新增表: memories, conversation_summaries';
END $$;
