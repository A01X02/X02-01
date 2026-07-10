import { supabaseAdmin } from '@/lib/supabase'
import { DOUBAO_API_KEY, DOUBAO_API_ENDPOINT } from '@/lib/config'

// 记忆类型定义
export type MemoryType = 'preference' | 'fact' | 'event' | 'summary'

export interface Memory {
  id: string
  user_id: string
  conversation_id?: string
  content: string
  memory_type: MemoryType
  importance: number
  tags: string[]
  is_active: boolean
  access_count: number
  last_accessed_at?: string
  created_at: string
  updated_at: string
}

// 提取关键词用于记忆检索
export function extractKeywords(text: string): string[] {
  // 移除标点和特殊字符
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
  
  // 中文停用词
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
    '看', '好', '自己', '这', '那', '它', '他', '她', '什么', '怎么', '可以',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she',
    'it', 'we', 'they', 'to', 'in', 'on', 'at', 'for', 'of', 'and', 'or'
  ])
  
  // 分词（简单版：中文按字切，英文按空格切）
  const words: string[] = []
  
  // 提取英文单词
  const englishWords = cleaned.match(/[a-zA-Z]+/g) || []
  words.push(...englishWords.filter(w => w.length > 2 && !stopWords.has(w.toLowerCase())))
  
  // 提取中文短语（2-4字）
  const chineseText = cleaned.match(/[\u4e00-\u9fa5]+/g) || []
  for (const segment of chineseText) {
    for (let len = 2; len <= Math.min(4, segment.length); len++) {
      for (let i = 0; i <= segment.length - len; i++) {
        const word = segment.substring(i, i + len)
        if (!stopWords.has(word)) {
          words.push(word)
        }
      }
    }
  }
  
  // 去重并返回前10个
  return [...new Set(words)].slice(0, 10)
}

// 检索相关记忆
export async function retrieveMemories(
  userId: string,
  query: string,
  limit: number = 10
): Promise<Memory[]> {
  const keywords = extractKeywords(query)
  
  const { data, error } = await supabaseAdmin
    .rpc('search_memories', {
      p_user_id: userId,
      p_keywords: keywords,
      p_limit: limit
    })

  if (error || !data || data.length === 0) {
    return []
  }

  // 更新记忆访问计数
  for (const mem of data) {
    await supabaseAdmin.rpc('touch_memory', { p_memory_id: mem.id })
  }

  return data.map((m: any) => ({
    id: m.id,
    user_id: userId,
    content: m.content,
    memory_type: m.memory_type,
    importance: m.importance,
    tags: m.tags || [],
    is_active: true,
    access_count: m.access_count,
    created_at: m.created_at,
    updated_at: m.created_at
  }))
}

// 构建记忆上下文（注入到AI对话中）
export function buildMemoryContext(memories: Memory[]): string {
  if (memories.length === 0) return ''

  const lines: string[] = ['[以下是关于用户的记忆，请在回复时参考这些信息：]']
  
  for (const mem of memories) {
    const typeLabel = {
      preference: '偏好',
      fact: '事实',
      event: '事件',
      summary: '摘要'
    }[mem.memory_type] || '其他'
    
    lines.push(`【${typeLabel}】${mem.content}`)
  }
  
  lines.push('[以上记忆仅供参考，请自然地融入对话中，不要生硬地提及"我记得"之类的话。]')
  
  return lines.join('\n')
}

// 从对话中提取记忆（调用AI）
export async function extractMemoriesFromConversation(
  userId: string,
  conversationId: string,
  messages: { role: string; content: string }[]
): Promise<{ content: string; memory_type: MemoryType; importance: number; tags: string[] }[]> {
  // 如果没有配置豆包API，跳过自动提取
  if (!DOUBAO_API_KEY) {
    return []
  }

  const prompt = `请分析以下对话，提取值得长期记忆的信息。

对话内容：
${messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')}

请以JSON数组格式返回提取的记忆，每条记忆包含：
- content: 记忆内容描述（简洁明了）
- memory_type: 类型（preference=用户偏好, fact=个人事实, event=重要事件, summary=对话摘要）
- importance: 重要程度1-10
- tags: 关键词标签数组

只提取真正有价值的信息，忽略闲聊和无意义内容。
返回格式：[{"content":"...","memory_type":"...","importance":5,"tags":["..."]}]`

  try {
    const response = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: 'ep-3minstm8r9zvkrv8t', // 豆包seed模型ID
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 尝试解析JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0])
      return extracted.filter((m: any) => 
        m.content && m.memory_type && ['preference', 'fact', 'event', 'summary'].includes(m.memory_type)
      )
    }
  } catch (error) {
    console.error('记忆提取失败:', error)
  }

  return []
}

// 保存记忆到数据库
export async function saveMemories(
  userId: string,
  conversationId: string,
  memories: { content: string; memory_type: MemoryType; importance: number; tags: string[] }[]
): Promise<void> {
  if (memories.length === 0) return

  const records = memories.map(m => ({
    user_id: userId,
    conversation_id: conversationId,
    content: m.content,
    memory_type: m.memory_type,
    importance: m.importance,
    tags: m.tags || []
  }))

  const { error } = await supabaseAdmin
    .from('memories')
    .insert(records)

  if (error) {
    console.error('保存记忆失败:', error)
  }
}

// 获取对话历史（带摘要优化）
export async function getConversationHistory(
  conversationId: string,
  maxMessages: number = 20
): Promise<{ role: string; content: string }[]> {
  // 获取最近的对话摘要
  const { data: summaries } = await supabaseAdmin
    .from('conversation_summaries')
    .select('summary')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)

  // 获取最近的消息
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(maxMessages)

  const history: { role: string; content: string }[] = []

  // 如果有摘要，先添加摘要作为系统上下文
  if (summaries && summaries.length > 0) {
    history.push({
      role: 'system',
      content: `[之前的对话摘要：${summaries[0].summary}]`
    })
  }

  // 添加最近的消息（反转为正序）
  if (messages) {
    history.push(...messages.reverse().map((m: any) => ({
      role: m.role,
      content: m.content
    })))
  }

  return history
}

// 生成对话摘要（当消息超过阈值时触发）
export async function generateConversationSummary(
  userId: string,
  conversationId: string,
  messages: { role: string; content: string }[]
): Promise<void> {
  if (!DOUBAO_API_KEY || messages.length < 10) return

  const prompt = `请用2-3句话总结以下对话的要点：

${messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')}

直接输出摘要内容，不要加任何前缀。`

  try {
    const response = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: 'ep-3minstm8r9zvkrv8t',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      })
    })

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content || ''

    if (summary) {
      await supabaseAdmin
        .from('conversation_summaries')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          summary,
          message_count: messages.length
        })
    }
  } catch (error) {
    console.error('生成摘要失败:', error)
  }
}
