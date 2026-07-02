import { useEffect, useRef, type DependencyList } from 'react'

type DebouncedAutoSaveOptions = {
  delay?: number
  ready?: boolean
  enabled?: boolean
}

export function useDebouncedAutoSave(
  callback: () => void,
  deps: DependencyList,
  { delay = 600, ready = true, enabled = true }: DebouncedAutoSaveOptions = {},
) {
  const skipRef = useRef(true)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!ready) {
      skipRef.current = true
    }
  }, [ready])

  useEffect(() => {
    if (!enabled || !ready) return

    if (skipRef.current) {
      skipRef.current = false
      return
    }

    const timer = window.setTimeout(() => callbackRef.current(), delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, enabled, ready, ...deps])
}
