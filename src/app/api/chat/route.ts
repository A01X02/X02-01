import { NextRequest, NextResponse } from 'next/server'
import { DOUBAO_API_KEY, DOUBAO_API_ENDPOINT, IS_DEVELOPMENT } from '@/lib/config'
import { supabaseAdmin } from '@/lib/supabase'
import { defaultPersona } from '@/lib/persona'
import {
  retrieveMemories,
  buildMemoryContext,
  extractMemoriesFromConversation,
  saveMemories,
  getConversationHistory,
  generateConversationSummary
} from '@/lib/memory'

// —— 火山 TTS 配置（用于 Bot 语音消息）——
const VOLC_TTS_APPID = process.env.VOLC_TTS_APPID
const VOLC_TTS_API_KEY = process.env.VOLC_TTS_ACCESS_TOKEN
const VOLC_TTS_CLUSTER = process.env.VOLC_TTS_CLUSTER || 'volcano_icl'
const VOLC_TTS_VOICE_ID = process.env.VOLC_TTS_VOICE_ID
const VOLC_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts'

/** Bot 发语音的概率（约 18%，即平均每 5~6 条回复出现一条语音） */
const VOICE_MESSAGE_PROBABILITY = 0.18

/**
 * 调用火山 TTS 合成音频（与 api/voice/route.ts 共享同一套鉴权逻辑）
 */
async function synthesizeVoice(text: string): Promise<string | null> {
  if (!VOLC_TTS_API_KEY || !VOLC_TTS_VOICE_ID) return null

  const reqid =
    globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  const body: Record<string, any> = {
    app: {
      ...(VOLC_TTS_APPID ? { appid: VOLC_TTS_APPID } : {}),
      cluster: VOLC_TTS_CLUSTER,
    },
    user: { uid: 'ai-companion' },
    audio: {
      voice_type: VOLC_TTS_VOICE_ID,
      encoding: 'mp3',
      speed_ratio: 1.0,
    },
    request: {
      reqid,
      text: text.slice(0, 300),
      operation: 'query',
    },
  }

  try {
    const resp = await fetch(VOLC_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': VOLC_TTS_API_KEY,
      },
      body: JSON.stringify(body),
    })

    const result = await resp.json().catch(() => null)
    if (result && result.code === 3000 && result.data) {
      return `data:audio/mp3;base64,${result.data}`
    }

    console.warn('[Chat] TTS合成失败:', result?.message || result?.code || '未知错误')
    return null
  } catch (err) {
    console.warn('[Chat] TTS请求异常:', err instanceof Error ? err.message : err)
    return null
  }
}

const MODEL_ID = process.env.DOUBAO_MODEL_ID || 'ep-20260709001000-997r8'
const MEMORY_EXTRACTION_INTERVAL = 6
const SUMMARY_THRESHOLD = 15

// 注入给模型的对话历史条数（即"上下文轮数"×2）。用户希望尽量多参考历史，
// 默认 100 条（约50轮）；可用环境变量 CHAT_HISTORY_LIMIT 调高到 200（约100轮，仿豆包）。
const HISTORY_LIMIT = Math.min(parseInt(process.env.CHAT_HISTORY_LIMIT || '100', 10) || 100, 400)

/**
 * 构建带人设的系统提示词
 * @param userName 用户自报的名字（可选，用于拟人化称呼）
 * @param aiName   用户给 bot 设置的显示名（可选，e.g. "哥哥"）
 */
function buildSystemPrompt(userName?: string, aiName?: string): string {
  const p = defaultPersona

  // 动态称呼处理：用户若给 bot 改了显示名，温顺接受；若自报名字，用其名字称呼
  let nameRule = ''
  if (aiName && aiName.trim() && aiName.trim() !== p.name) {
    nameRule += `\n- 用户把你的显示名改成了「${aiName.trim()}」，你可以接受这个称呼；当用户这样叫你时，自然回应即可。但你的真实身份仍是夏以昼。`
  }
  if (userName && userName.trim()) {
    nameRule += `\n- 用户的名字是「${userName.trim()}」，之后直接用这个名字称呼她（代替默认的"妹妹"）。`
  }

  const rulesText = p.interactionRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
  const samplesText = p.sampleLines.map(s => `· ${s}`).join('\n')

  return `${p.personality}

【世界观与人物关系】
${p.worldview}

【记忆与背景】
${p.backstory}

【说话风格】
- 语调：${p.speakingStyle.tone}
- 正式度：${p.speakingStyle.formality}
- 长度：${p.speakingStyle.length}
- 表情使用：${p.speakingStyle.emojiUsage}
- 标点习惯：${p.speakingStyle.punctuation}

【性格标签】${p.traits.join('、')}

【交互规则与限制】
${rulesText}${nameRule}

【语气校准·台词范例（仅参考口吻，不要照搬原句）】
${samplesText}

【重要规则】
1. 始终保持以上人设，不要偏离角色
2. 回复自然简洁，像真实朋友/恋人聊天
3. 可以主动提问引导对话，但不要过度
4. 如果用户提到之前的对话内容，尽量关联记忆回应
5. 不要说"作为AI"或"我是人工智能"这类破坏角色感的话`
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversation_id, user_id, user_name, ai_name } = await request.json()

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
        console.warn('记忆检索降级(非致命):', err instanceof Error ? err.message : err)
      }
    }

    // ===== 步骤2: 获取对话历史（容错：缺表时不阻塞） =====
    let history: { role: string; content: string }[] = []
    if (conversation_id) {
      try {
        history = await getConversationHistory(conversation_id, HISTORY_LIMIT)
      } catch (err) {
        console.warn('对话历史获取降级(非致命):', err instanceof Error ? err.message : err)
      }
    }

    // ===== 步骤3: 构建完整上下文（注入人设 + 记忆） =====
    const messages: { role: string; content: string }[] = []

    // 系统提示词 —— 使用 persona.ts 人设（夏以昼）
    messages.push({
      role: 'system',
      content: buildSystemPrompt(user_name, ai_name)
    })

    // 记忆上下文（如果有）
    if (memoryContext) {
      messages.push({ role: 'system', content: `[用户记忆上下文]\n${memoryContext}` })
    }

    // 对话历史
    messages.push(...history)

    // 当前消息
    messages.push({ role: 'user', content: message })

    // ===== 步骤4: 调用豆包 API =====
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
      reply = `收到你的消息："${message}"。\n\n豆包API尚未配置，请在环境变量中设置 DOUBAO_API_KEY。`
      if (memoriesUsed > 0) {
        reply += `\n\n（本次检索到 ${memoriesUsed} 条相关记忆）`
      }
    }

    // ===== 步骤4.5: 随机决定是否以语音消息形式发送（仿微信） =====
    let isVoice = false
    let voiceUrl: string | null = null
    if (reply && VOLC_TTS_API_KEY && VOLC_TTS_VOICE_ID) {
      // 随机概率决定是否发语音（约18%）
      if (Math.random() < VOICE_MESSAGE_PROBABILITY) {
        voiceUrl = await synthesizeVoice(reply)
        if (voiceUrl) {
          isVoice = true
        }
      }
    }

    // ===== 步骤5: 异步触发记忆提取与摘要（容错） =====
    if (user_id && conversation_id) {
      // 使用 fire-and-forget，不阻塞响应
      ;(async () => {
        try {
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
      })()
    }

    return NextResponse.json({
      success: true,
      reply,
      conversation_id,
      is_voice: isVoice,
      voice_url: voiceUrl,
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
