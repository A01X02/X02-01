import { NextRequest, NextResponse } from 'next/server'
import { DOUBAO_API_KEY, DOUBAO_API_ENDPOINT } from '@/lib/config'
import { supabaseAdmin } from '@/lib/supabase'
import { 
  retrieveMemories, 
  buildMemoryContext, 
  extractMemoriesFromConversation,
  saveMemories,
  getConversationHistory,
  generateConversationSummary
} from '@/lib/memory'

const MODEL_ID = 'ep-20260709001000-997r8' // 豆包seed模型ID（替换为实际ID）
const MEMORY_EXTRACTION_INTERVAL = 6  // 每6轮对话触发一次记忆提取
const SUMMARY_THRESHOLD = 15          // 超过15条消息触发摘要生成

export async function POST(request: NextRequest) {
  try {
    const { message, conversation_id, user_id } = await request.json()

    if (!message) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 })
    }

    let reply = ''
    let memoriesUsed: number = 0

    // ===== 步骤1: 检索相关记忆（容错：缺表/RPC时不阻塞） =====
    let memoryContext = ''
    if (user_id) {
      try {
        const memories = await retrieveMemories(user_id, message, 8)
        memoriesUsed = memories.length
        memoryContext = buildMemoryContext(memories)
      } catch (err) {
        // RPC函数或memories表不存在时降级为无记忆模式
        console.warn('记忆检索降级(非致命):', err instanceof Error ? err.message : err)
      }
    }

    // ===== 步骤2: 获取对话历史（容错：缺表时不阻塞） =====
    let history: { role: string; content: string }[] = []
    if (conversation_id) {
      try {
        history = await getConversationHistory(conversation_id, 20)
      } catch (err) {
        console.warn('对话历史获取降级(非致命):', err instanceof Error ? err.message : err)
      }
    }

    // ===== 步骤3: 构建完整上下文 =====
    const messages: { role: string; content: string }[] = []

    // 系统提示词
    messages.push({
      role: 'system',
      content: '你是一个温暖、自然的AI对话伙伴。请用简洁口语化的方式回复，像一个真实的人在聊天。不要过度演绎，不要说废话。'
    })

    // 记忆上下文
    if (memoryContext) {
      messages.push({ role: 'system', content: memoryContext })
    }

    // 对话历史
    messages.push(...history)

    // 当前消息
    messages.push({ role: 'user', content: message })

    // ===== 步骤4: 调用豆包seed API =====
    if (DOUBAO_API_KEY) {
      try {
        const response = await fetch(`${DOUBAO_API_ENDPOINT}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DOUBAO_API_KEY}`
          },
          body: JSON.stringify({
            model: MODEL_ID,
            messages,
            temperature: 0.8,
            max_tokens: 2000,
            stream: false
          })
        })

        const data = await response.json()
        reply = data.choices?.[0]?.message?.content || '抱歉，我暂时无法回复。'
      } catch (error) {
        console.error('豆包API调用失败:', error)
        reply = '抱歉，AI服务暂时不可用。'
      }
    } else {
      // 模拟响应（开发测试用）
      reply = `收到你的消息："${message}"。\n\n豆包seed API尚未配置，请在.env.local中设置DOUBAO_API_KEY。`
      if (memoriesUsed > 0) {
        reply += `\n\n（本次检索到 ${memoriesUsed} 条相关记忆）`
      }
    }

    // ===== 步骤5: 异步触发记忆提取（容错：缺表时不阻塞响应） =====
    if (user_id && conversation_id) {
      try {
        // 获取当前对话消息数
        const { count } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation_id)

        const messageCount = count || 0

        // 每 N 轮触发记忆提取
        if (messageCount > 0 && messageCount % MEMORY_EXTRACTION_INTERVAL === 0) {
          try {
            const { data: recentMessages } = await supabaseAdmin
              .from('messages')
              .select('role, content')
              .eq('conversation_id', conversation_id)
              .order('created_at', { ascending: false })
              .limit(MEMORY_EXTRACTION_INTERVAL)

            if (recentMessages && recentMessages.length > 0) {
              const allMessages = [
                ...recentMessages.reverse().map((m: any) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
                { role: 'assistant', content: reply }
              ]

              extractMemoriesFromConversation(user_id, conversation_id, allMessages)
                .then(memories => saveMemories(user_id, conversation_id, memories))
                .catch(err => console.error('记忆提取异步任务失败:', err))
            }
          } catch (err) {
            console.warn('记忆提取跳过(缺表):', err instanceof Error ? err.message : err)
          }
        }

        // 超过阈值触发摘要生成
        if (messageCount >= SUMMARY_THRESHOLD && messageCount % SUMMARY_THRESHOLD === 0) {
          try {
            const { data: allMessages } = await supabaseAdmin
              .from('messages')
              .select('role, content')
              .eq('conversation_id', conversation_id)
              .order('created_at', { ascending: true })
              .limit(SUMMARY_THRESHOLD)

            if (allMessages && allMessages.length > 0) {
              generateConversationSummary(
                user_id,
                conversation_id,
                allMessages.map((m: any) => ({ role: m.role, content: m.content }))
              ).catch(err => console.error('摘要生成失败:', err))
            }
          } catch (err) {
            console.warn('摘要生成跳过(缺表):', err instanceof Error ? err.message : err)
          }
        }
      } catch (err) {
        console.warn('异步记忆处理跳过(缺表):', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({
      success: true,
      reply,
      conversation_id,
      meta: {
        memories_used: memoriesUsed,
        history_length: history.length
      }
    })

  } catch (error) {
    console.error('Chat API错误:', error)
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    )
  }
}
