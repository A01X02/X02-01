'use client'

import { useState } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSend(message)
      setMessage('')
    }
  }

  return (
    <div className="glass safe-bottom border-t border-light-gray px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-end space-x-2">
        {/* 语音按钮 */}
        <button
          type="button"
          className="p-2 text-medium-gray hover:text-dark-gray transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* 输入框 */}
        <div className="flex-1 glass-subtle rounded-2xl px-4 py-2.5 flex items-center focus-within:ring-2 focus-within:ring-primary-orange/40 focus-within:border-primary-orange/50 transition">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入消息..."
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-dark-gray placeholder-medium-gray tracking-breath"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                handleSubmit(e)
              }
            }}
          />
        </div>

        {/* 发送按钮 */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="p-2 text-white bg-primary-orange rounded-full hover:bg-deep-orange hover:shadow-gold-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  )
}
