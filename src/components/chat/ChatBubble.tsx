'use client'

import { useState, useRef, useEffect } from 'react'
import { Message } from '@/types'

interface ChatBubbleProps {
  message: Message
  grouped?: boolean
  onRegenerate?: () => void
  regenerateCount?: number
  maxRegenerateCount?: number
  onFeedback?: (type: 'like' | 'dislike') => void
  currentFeedback?: string | null
  onSpeak?: () => void
  speaking?: boolean
}

export default function ChatBubble({
  message,
  grouped = false,
  onRegenerate,
  regenerateCount = 0,
  maxRegenerateCount = 10,
  onFeedback,
  currentFeedback,
  onSpeak,
  speaking = false,
}: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const isPressed = useRef(false)

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current)
    }
  }, [])

  const handlePressStart = () => {
    if (!isAssistant || !onFeedback) return
    isPressed.current = true
    pressTimer.current = setTimeout(() => {
      if (isPressed.current) {
        setFeedbackVisible(true)
        setShowFeedback(true)
      }
    }, 500)
  }

  const handlePressEnd = () => {
    isPressed.current = false
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  /** 关闭反馈面板（含淡出动画后彻底移除） */
  const closeFeedback = () => {
    setFeedbackVisible(false)
    setTimeout(() => setShowFeedback(false), 200)
  }

  useEffect(() => {
    if (!feedbackVisible) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        closeFeedback()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [feedbackVisible])

  // 预计算 class 名（避免 JSX 中复杂模板字面量解析问题）
  const wrapperCls = [
    'flex items-end fade-in',
    isUser ? 'justify-end' : 'justify-start',
    grouped ? 'mt-1.5' : 'mt-4',
  ].join(' ')

  const bubbleCls = [
    'max-w-[70%] relative px-4 py-3',
    isUser ? 'chat-bubble-user' : 'chat-bubble-ai',
  ].join(' ')

  const remainCount = maxRegenerateCount - regenerateCount
  const regenTitle = regenerateCount >= maxRegenerateCount
    ? '已达到最大重试次数'
    : '重新生成 (' + remainCount + ')'

  return (
    <div className={wrapperCls} ref={bubbleRef}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-accent-blue flex items-center justify-center flex-shrink-0 mb-5 mr-2 shadow-blue-glow ring-2 ring-accent-blue/20">
          <span className="text-white text-xs font-semibold">AI</span>
        </div>
      )}

      {/* 气泡主体：绑定长按事件 */}
      <div
        className={bubbleCls}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        <p className="text-sm leading-relaxed tracking-breath whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {!grouped && (
          <p className={['text-[11px] mt-1.5', isUser ? 'text-white/70 text-right' : 'text-medium-gray'].join(' ')}>
            {new Date(message.created_at).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        {/* ====== AI 消息操作栏 ====== */}
        {isAssistant && (
          <>
            {/* 底部操作按钮：朗读 + 重新生成 */}
            <div className="absolute -bottom-5 right-1 flex items-center gap-3">
              {/* 朗读按钮 */}
              {onSpeak && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSpeak() }}
                  className={[
                    'flex items-center gap-1 text-[10px] transition-colors',
                    speaking ? 'text-accent-blue' : 'text-medium-gray hover:text-accent-blue',
                  ].join(' ')}
                  title={speaking ? '朗读中…' : '朗读'}
                >
                  {speaking ? (
                    <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4.03v8.06A4.5 4.5 0 0016.5 12zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5 9v6h4l5 5V4L9 9H5z" />
                    </svg>
                  )}
                </button>
              )}

              {/* 重新生成按钮 */}
              {onRegenerate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegenerate() }}
                  disabled={regenerateCount >= maxRegenerateCount}
                  className="flex items-center gap-1 text-[10px] text-medium-gray hover:text-accent-blue transition-colors disabled:opacity-30"
                  title={regenTitle}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{remainCount}</span>
                </button>
              )}
            </div>

            {/* 长按反馈面板 */}
            <div
              className={[
                'absolute -top-10 left-1/2 -translate-x-1/2 flex gap-2 transition-all duration-200',
                showFeedback ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none',
              ].join(' ')}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onFeedback?.('like'); closeFeedback(); }}
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg',
                  currentFeedback === 'like'
                    ? 'bg-emerald-100 text-emerald-600 ring-2 ring-emerald-400'
                    : 'glass-strong text-medium-gray hover:bg-emerald-50 hover:text-emerald-600',
                ].join(' ')}
                title="喜欢这个回复"
              >
                <svg className="w-5 h-5" fill={currentFeedback === 'like' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onFeedback?.('dislike'); closeFeedback(); }}
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg',
                  currentFeedback === 'dislike'
                    ? 'bg-red-100 text-red-600 ring-2 ring-red-400'
                    : 'glass-strong text-medium-gray hover:bg-red-50 hover:text-red-600',
                ].join(' ')}
                title="不喜欢这个回复"
              >
                <svg className="w-5 h-5" fill={currentFeedback === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
            </div>

            {!currentFeedback && !showFeedback && onFeedback && (
              <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[9px] text-medium-gray/40 select-none hidden sm:block">
                长按反馈
              </span>
            )}
          </>
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
