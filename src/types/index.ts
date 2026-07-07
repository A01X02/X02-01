// 用户资料类型
export interface Profile {
  id: string
  username?: string
  display_name?: string
  avatar_url?: string
  bio?: string
  chat_theme_id?: string
  voice_profile_id?: string
  created_at: string
  updated_at: string
}

// 对话类型
export interface Conversation {
  id: string
  user_id: string
  title?: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

// 消息类型
export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  message_type: 'text' | 'voice' | 'image'
  voice_url?: string
  image_url?: string
  metadata?: any
  created_at: string
}

// 朋友圈动态类型
export interface Moment {
  id: string
  user_id: string
  content?: string
  image_urls?: string[]
  video_url?: string
  is_ai_generated: boolean
  likes_count: number
  comments_count: number
  created_at: string
  updated_at: string
  // 关联数据
  user?: Profile
  is_liked?: boolean
}

// 评论类型
export interface Comment {
  id: string
  moment_id: string
  user_id: string
  content: string
  parent_id?: string
  created_at: string
  // 关联数据
  user?: Profile
  replies?: Comment[]
}

// 点赞类型
export interface Like {
  id: string
  moment_id: string
  user_id: string
  created_at: string
}

// 语音配置类型
export interface VoiceProfile {
  id: string
  user_id?: string
  name: string
  voice_id?: string
  is_cloned: boolean
  clone_audio_url?: string
  sample_text?: string
  is_public: boolean
  created_at: string
}

// 聊天主题类型
export interface ChatTheme {
  id: string
  name: string
  description?: string
  avatar_url?: string
  background_url?: string
  character_gif_url?: string
  is_ai: boolean
  ai_personality?: string
  is_public: boolean
  created_by?: string
  created_at: string
}

// 用户设置类型
export interface UserSettings {
  id: string
  user_id: string
  theme: 'light' | 'dark' | 'auto'
  language: string
  voice_auto_play: boolean
  message_font_size: number
  settings?: any
  created_at: string
  updated_at: string
}

// API响应类型
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// 聊天消息（前端使用）
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
}
