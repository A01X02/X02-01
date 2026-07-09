'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface VoiceMessageBubbleProps {
  /** 音频 URL（data:audio/mp3;base64,... 或远程URL） */
  audioUrl: string
  /** 文字内容（语音转文字显示） */
  text?: string
  /** 时长秒数（用于显示 "3″" 样式，可选；不传则根据文本估算） */
  duration?: number
  /** 是否为 AI 发出的消息（决定气泡靠左/靠右） */
  isFromAI?: boolean
  /** 播放状态由外部控制时传入 */
  isPlaying?: boolean
}

/**
 * 仿微信语音消息气泡
 * - 显示时长 + 播放/暂停按钮
 * - 点击播放/暂停音频
 * - 动态波形动画（播放中）
 * - "转文字" 按钮：点击展开文字内容
 * - 绿色(用户)/白色(AI) 双色适配
 */
export default function VoiceMessageBubble({
  audioUrl,
  text,
  duration,
  isFromAI = false,
}: VoiceMessageBubbleProps) {
  const [playing, setPlaying] = useState(false)
  const [showText, setShowText] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 估算时长：中文约 4 字/秒
  const estimatedDuration = duration || (text ? Math.max(1, Math.ceil(text.length / 4)) : 2)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const togglePlay = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio(audioUrl)
      el.onended = () => setPlaying(false)
      el.ontimeupdate = () => setCurrentTime(el.currentTime)
      audioRef.current = el
    }

    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      // 先停掉其他可能的播放（简单处理）
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => setPlaying(false))
      setPlaying(true)
    }
  }, [playing, audioUrl])

  return (
    <div className={`flex items-end gap-2 ${isFromAI ? '' : 'flex-row-reverse'}`}>
      {/* 语音气泡 */}
      <button
        onClick={togglePlay}
        className={`
          flex items-center gap-2 px-3 py-2.5 rounded-2xl min-w-[100px] max-w-[220px]
          transition-all active:scale-[0.97]
          ${isFromAI
            ? 'bg-white shadow-sm border border-light-gray/80'
            : 'bg-[#95EC69] shadow-sm'
          }
        `}
      >
        {/* 波形图标（静态 or 动态） */}
        <span className={`flex items-center gap-0.5 ${isFromAI ? 'text-dark-gray' : 'text-gray-800'}`}>
          {playing ? (
            // 播放中动态波形
            <>
              {[...Array(4)].map((_, i) => (
                <span
                  key={i}
                  className="w-0.5 bg-current rounded-full animate-pulse"
                  style={{
                    height: `${8 + (i % 2 === 0 ? 6 : -4)}px`,
                    animationDelay: `${i * 150}ms`,
                    animationDuration: '400ms',
                  }}
                />
              ))}
            </>
          ) : (
            // 静态扬声器图标
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          )}
        </span>

        {/* 时长 */}
        <span className={`text-xs font-medium ${isFromAI ? 'text-dark-gray/80' : 'text-gray-800/90'}`}>
          {estimatedDuration}&Prime;
        </span>

        {/* 播放进度条（仅播放时） */}
        {playing && audioRef.current && (
          <div className="flex-1 h-0.5 bg-black/10 rounded overflow-hidden">
            <div
              className="h-full bg-current rounded transition-all"
              style={{
                width: `${(currentTime / (estimatedDuration || 1)) * 100}%`,
                opacity: 0.4,
              }}
            />
          </div>
        )}
      </button>

      {/* 转文字按钮 */}
      {(text && !showText) && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowText(true) }}
          className={`px-2 py-1 rounded-lg text-xs ${
            isFromAI
              ? 'text-accent-blue hover:bg-blue-50'
              : 'text-green-700 hover:bg-green-50'
          } transition-colors`}
          title="转为文字"
        >
          转文字
        </button>
      )}

      {/* 文字展开区域 */}
      {showText && text && (
        <div className={`
          max-w-[240px] px-3 py-2.5 rounded-2xl text-sm leading-relaxed
          ${isFromAI
            ? 'bg-white/70 border border-light-gray/50 text-dark-gray'
            : 'bg-[#95EC69]/30 border border-[#95EC69]/50 text-gray-800'
          }
        `}>
          {text}
        </div>
      )}
    </div>
  )
}
