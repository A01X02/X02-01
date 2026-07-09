'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [voiceName, setVoiceName] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      toast.error('无法访问麦克风，请检查权限设置')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const uploadVoice = async () => {
    if (!audioUrl || !voiceName.trim()) {
      toast.error('请输入声音名称并录制音频')
      return
    }

    setIsUploading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('请先登录')
        setIsUploading(false)
        return
      }

      // 获取音频blob
      const response = await fetch(audioUrl)
      const blob = await response.blob()
      const fileName = `voices/${user.id}/${Date.now()}.webm`

      // 上传到Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('voices')
        .upload(fileName, blob)

      if (uploadError) {
        toast.error('上传失败')
        setIsUploading(false)
        return
      }

      // 获取公开URL
      const { data: { publicUrl } } = supabase
        .storage
        .from('voices')
        .getPublicUrl(fileName)

      // 保存到数据库
      const { error: dbError } = await supabase
        .from('voice_profiles')
        .insert({
          user_id: user.id,
          name: voiceName,
          is_cloned: true,
          clone_audio_url: publicUrl,
          sample_text: '你好，这是我的声音克隆样本。',
          is_public: false
        })

      if (dbError) {
        toast.error('保存失败')
      } else {
        toast.success('语音克隆样本已上传！')
        setVoiceName('')
        setAudioUrl(null)
      }
    } catch (error) {
      toast.error('上传过程中出错')
    }

    setIsUploading(false)
  }

  return (
    <div className="space-y-4">
      {/* 声音名称 */}
      <input
        type="text"
        value={voiceName}
        onChange={(e) => setVoiceName(e.target.value)}
        placeholder="给这个声音起个名字..."
        className="w-full glass-subtle rounded-2xl p-4 text-sm outline-none text-dark-gray placeholder-medium-gray tracking-breath"
      />

      {/* 录音按钮 */}
      <div className="flex items-center justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500 animate-pulse'
              : 'bg-primary-orange hover:bg-deep-orange'
          }`}
        >
          {isRecording ? (
            <div className="w-6 h-6 bg-white rounded"></div>
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-center text-xs text-medium-gray">
        {isRecording ? '正在录音...点击停止' : '点击开始录音'}
      </p>

      {/* 音频预览 */}
      {audioUrl && (
        <div className="space-y-2">
          <audio src={audioUrl} controls className="w-full" />
          <button
            onClick={uploadVoice}
            disabled={isUploading || !voiceName.trim()}
            className="w-full bg-primary-orange text-white py-3 rounded-2xl font-medium hover:bg-deep-orange hover:shadow-gold-glow transition-all disabled:opacity-50"
          >
            {isUploading ? '上传中...' : '上传克隆样本'}
          </button>
        </div>
      )}
    </div>
  )
}
