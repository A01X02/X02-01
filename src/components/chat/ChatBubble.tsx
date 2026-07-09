import { Message } from '@/types'

interface ChatBubbleProps {
  message: Message
  grouped?: boolean
}

export default function ChatBubble({ message, grouped = false }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-end ${isUser ? 'justify-end' : 'justify-start'} fade-in ${grouped ? 'mt-1.5' : 'mt-4'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-accent-blue flex items-center justify-center flex-shrink-0 mb-5 mr-2 shadow-blue-glow ring-2 ring-accent-blue/20">
          <span className="text-white text-xs font-semibold">AI</span>
        </div>
      )}
      <div className={`max-w-[70%] ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'} px-4 py-3`}>
        <p className="text-sm leading-relaxed tracking-breath whitespace-pre-wrap break-words">{message.content}</p>
        {!grouped && (
          <p className={`text-[11px] mt-1.5 ${isUser ? 'text-white/70 text-right' : 'text-medium-gray'}`}>
            {new Date(message.created_at).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-orange flex items-center justify-center flex-shrink-0 mb-5 ml-2 shadow-gold-glow ring-2 ring-primary-orange/20">
          <span className="text-white text-xs font-semibold">我</span>
        </div>
      )}
    </div>
  )
}
