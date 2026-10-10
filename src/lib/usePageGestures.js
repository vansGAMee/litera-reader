import { useRef } from 'react'
import { gestureDirection } from './readingExtras.js'

export function usePageGestures(onTurn, disabled) {
  const start = useRef(null)
  return {
    onPointerDown(e) {
      if (!e.isPrimary || e.button !== 0 || disabled || e.target.closest('button,input,a,select,textarea')) { start.current = null; return }
      const paper = e.target.closest('.paper')
      if (!paper) return
      const rect = e.currentTarget.getBoundingClientRect()
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now(), ratio: (e.clientX - rect.left) / rect.width, paper, scroll: paper.scrollTop, deskScroll: e.currentTarget.scrollTop }
    },
    onPointerCancel() { start.current = null },
    onPointerUp(e) {
      const first = start.current; start.current = null
      if (!first || first.id !== e.pointerId || disabled || Math.abs(first.paper.scrollTop - first.scroll) > 2 || Math.abs(e.currentTarget.scrollTop - first.deskScroll) > 2) return
      const direction = gestureDirection({ dx: e.clientX - first.x, dy: e.clientY - first.y, duration: performance.now() - first.time, ratio: first.ratio, selected: !!window.getSelection()?.toString().trim() })
      if (direction) onTurn(direction)
    },
  }
}
