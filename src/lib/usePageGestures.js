import { useRef } from 'react'
import { gestureDirection } from './readingExtras.js'

export function usePageGestures(onTurn, disabled) {
  const pointerStart = useRef(null)
  const touchStart = useRef(null)

  return {
    // Touch event handlers for mobile devices
    onTouchStart(e) {
      if (disabled || !e.touches || e.touches.length !== 1) {
        touchStart.current = null
        return
      }
      if (e.target.closest('button,input,a,select,textarea,.selection-action')) return

      const touch = e.touches[0]
      const rect = e.currentTarget.getBoundingClientRect()
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        time: performance.now(),
        ratio: (touch.clientX - rect.left) / Math.max(1, rect.width),
      }
    },

    onTouchMove(e) {
      if (!touchStart.current || !e.touches || e.touches.length !== 1) return
      const touch = e.touches[0]
      touchStart.current.lastX = touch.clientX
      touchStart.current.lastY = touch.clientY
    },

    onTouchEnd() {
      const first = touchStart.current
      touchStart.current = null
      if (!first || disabled) return

      const selected = Boolean(window.getSelection()?.toString().trim())
      const direction = gestureDirection({
        dx: first.lastX - first.x,
        dy: first.lastY - first.y,
        duration: performance.now() - first.time,
        ratio: first.ratio,
        selected,
      })
      if (direction) onTurn(direction)
    },

    onTouchCancel() {
      touchStart.current = null
    },

    // Pointer events for desktop mouse / trackpad
    onPointerDown(e) {
      if (e.pointerType === 'touch') return // Let touch handlers handle touch screens
      if (!e.isPrimary || e.button !== 0 || disabled || e.target.closest('button,input,a,select,textarea,.selection-action')) {
        pointerStart.current = null
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      pointerStart.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
        ratio: (e.clientX - rect.left) / Math.max(1, rect.width),
        deskScroll: e.currentTarget.scrollTop,
      }
    },

    onPointerCancel() {
      pointerStart.current = null
    },

    onPointerUp(e) {
      if (e.pointerType === 'touch') return
      const first = pointerStart.current
      pointerStart.current = null
      if (!first || first.id !== e.pointerId || disabled) return

      // Allow slight vertical scroll up to 40px during horizontal gestures
      const scrollDiff = Math.abs(e.currentTarget.scrollTop - first.deskScroll)
      if (scrollDiff > 40) return

      const selected = Boolean(window.getSelection()?.toString().trim())
      const direction = gestureDirection({
        dx: e.clientX - first.x,
        dy: e.clientY - first.y,
        duration: performance.now() - first.time,
        ratio: first.ratio,
        selected,
      })
      if (direction) onTurn(direction)
    },
  }
}
