import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { createGustoFlow, syncGustoOnboarding, type GustoFlowEntityType } from '@/lib/gusto-api'
import {
  GUSTO_FLOW_FINISH_EVENT,
  clearCachedGustoFlowUrl,
  gustoFlowCacheKey,
  isGustoFlowMessageOrigin,
  readCachedGustoFlowUrl,
  writeCachedGustoFlowUrl,
  type GustoFlowType,
} from '@/lib/gusto-flows'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'

interface GustoFlowEmbedProps {
  householdId: string
  gustoEnv: 'demo' | 'production'
  flowType: GustoFlowType
  title: string
  entityType?: GustoFlowEntityType
  entityUuid?: string
  onFlowComplete?: () => void
}

export function GustoFlowEmbed({
  householdId,
  gustoEnv,
  flowType,
  title,
  entityType,
  entityUuid,
  onFlowComplete,
}: GustoFlowEmbedProps) {
  const cacheKey = useMemo(
    () => gustoFlowCacheKey({ householdId, flowType, entityUuid }),
    [householdId, flowType, entityUuid],
  )

  const cachedOnMount = useMemo(() => readCachedGustoFlowUrl(cacheKey), [cacheKey])

  const [flowUrl, setFlowUrl] = useState<string | null>(() => cachedOnMount?.url ?? null)
  const [loading, setLoading] = useState(() => !cachedOnMount?.url)
  const [error, setError] = useState<string | null>(null)
  const syncedRef = useRef(false)
  const onFlowCompleteRef = useRef(onFlowComplete)
  onFlowCompleteRef.current = onFlowComplete

  const syncStatus = useCallback(async () => {
    if (syncedRef.current) return
    syncedRef.current = true
    try {
      await syncGustoOnboarding(householdId)
      onFlowCompleteRef.current?.()
    } catch (e) {
      console.warn('gusto onboarding sync failed', e)
    }
  }, [householdId])

  const loadFlow = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force) {
        const cached = readCachedGustoFlowUrl(cacheKey)
        if (cached) {
          setFlowUrl(cached.url)
          setError(null)
          setLoading(false)
          return
        }
      } else {
        clearCachedGustoFlowUrl(cacheKey)
      }

      setLoading(true)
      setError(null)
      if (options?.force) setFlowUrl(null)
      syncedRef.current = false

      try {
        const { url } = await createGustoFlow({
          householdId,
          flowType,
          entityType,
          entityUuid,
        })
        writeCachedGustoFlowUrl(cacheKey, url)
        setFlowUrl(url)
      } catch (e) {
        const msg = formatSupabaseError(e)
        setError(msg)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [cacheKey, householdId, flowType, entityType, entityUuid],
  )

  useEffect(() => {
    if (cachedOnMount?.url) return
    void loadFlow()
  }, [cachedOnMount?.url, loadFlow])

  useEffect(() => {
    if (!flowUrl) return

    const onMessage = (event: MessageEvent) => {
      if (!isGustoFlowMessageOrigin(event.origin, gustoEnv)) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      const record = data as { event?: string }
      if (record.event === GUSTO_FLOW_FINISH_EVENT) {
        syncedRef.current = false
        void syncStatus()
        toast.success('Gusto setup step saved')
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [flowUrl, gustoEnv, syncStatus])

  const showIframe = !!flowUrl && !loading

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {flowUrl ? (
          <a
            href={flowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
          >
            Open in new tab <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadFlow({ force: true })}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh flow link'}
        </Button>
      </div>

      <div className="relative min-h-[min(72vh,40rem)] flex-1 overflow-hidden rounded-lg border bg-[var(--color-muted)]/30">
        {loading && !showIframe ? (
          <div className="flex h-full min-h-[min(72vh,40rem)] items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Starting Gusto setup…
          </div>
        ) : null}
        {error && !showIframe ? (
          <div className="flex h-full min-h-[min(72vh,40rem)] flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <p className="text-[var(--color-destructive)]">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadFlow({ force: true })}>
              Try again
            </Button>
          </div>
        ) : null}
        {showIframe ? (
          <iframe
            key={flowUrl}
            title={title}
            src={flowUrl}
            className="h-[min(72vh,40rem)] w-full border-0 bg-white md:h-[calc(100dvh-14rem)]"
            allow="payment *; clipboard-write"
          />
        ) : null}
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Your setup session is remembered while this browser tab stays open. Use &quot;Refresh flow
        link&quot; only if Gusto shows a timeout or expired session error.
      </p>
    </div>
  )
}
