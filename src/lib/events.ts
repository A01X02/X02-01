/**
 * 跨组件事件总线 —— 用于底部导航栏与聊天页之间的状态协调
 *
 * 使用场景：点击已激活的"聊天"tab 时，切换聊天页的头部显示模式
 */

export const CHAT_EVENTS = {
  /** 切换聊天页头部显示模式（输入模式 ↔ 功能区） */
  TOGGLE_CHAT_MODE: 'toggle-chat-mode',
} as const

/** 发送事件 */
export function emitChatToggle() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_EVENTS.TOGGLE_CHAT_MODE))
  }
}

/** 监听事件，返回 cleanup 函数 */
export function onChatToggle(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => callback()
  window.addEventListener(CHAT_EVENTS.TOGGLE_CHAT_MODE, handler)
  return () => window.removeEventListener(CHAT_EVENTS.TOGGLE_CHAT_MODE, handler)
}
