import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  notificationId?: string
}

function parseKeyMap(envName: string): string {
  const raw = Deno.env.get(envName)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed.default ?? Object.values(parsed)[0] ?? ''
  } catch {
    return ''
  }
}

function getPublishableKey(): string {
  return (
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY') ??
    parseKeyMap('SUPABASE_PUBLISHABLE_KEYS') ??
    ''
  )
}

function getSecretKey(): string {
  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    parseKeyMap('SUPABASE_SECRET_KEYS') ??
    ''
  )
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const publishableKey = getPublishableKey()
    if (!supabaseUrl || !publishableKey) {
      console.error('send-email: missing SUPABASE_URL or publishable/anon key')
      return jsonResponse(
        {
          error:
            'Edge function misconfigured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).',
        },
        500,
      )
    }

    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('send-email: getUser failed', userError?.message)
      return jsonResponse({ error: userError?.message ?? 'Unauthorized' }, 401)
    }

    const body = (await req.json()) as EmailPayload
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('EMAIL_FROM') ?? 'Sova Home <hello@sova.baby>'

    if (!resendKey) {
      return jsonResponse(
        { error: 'RESEND_API_KEY not configured', skipped: true },
        200,
      )
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [body.to],
        subject: body.subject,
        html: body.html,
        ...(body.text ? { text: body.text } : {}),
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('send-email: Resend API error', res.status, errText)
      let message = errText
      try {
        const parsed = JSON.parse(errText) as { message?: string }
        message = parsed.message ?? errText
      } catch {
        /* use raw text */
      }
      return jsonResponse({ error: message }, 500)
    }

    if (body.notificationId) {
      const secretKey = getSecretKey()
      if (secretKey) {
        const admin = createClient(supabaseUrl, secretKey)
        await admin
          .from('notifications')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', body.notificationId)
      }
    }

    return jsonResponse({ ok: true }, 200)
  } catch (e) {
    console.error('send-email: unhandled error', e)
    return jsonResponse({ error: String(e) }, 500)
  }
})
