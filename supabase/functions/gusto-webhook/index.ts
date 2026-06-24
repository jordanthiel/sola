import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gusto-signature',
}

function getAdmin() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
  if (!url || !key) throw new Error('Missing Supabase service credentials')
  return createClient(url, key)
}

interface GustoWebhookPayload {
  event_type?: string
  resource_type?: string
  resource_uuid?: string
  entity_type?: string
  entity_uuid?: string
  uuid?: string
  company_uuid?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const verificationToken = Deno.env.get('GUSTO_WEBHOOK_VERIFICATION_TOKEN')
  if (verificationToken) {
    const headerToken = req.headers.get('X-Gusto-Verification-Token')
    if (headerToken !== verificationToken) {
      return new Response(JSON.stringify({ error: 'Invalid verification token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const payload = (await req.json()) as GustoWebhookPayload
    const eventType = payload.event_type ?? payload.entity_type ?? 'unknown'
    const eventUuid = payload.uuid ?? `${eventType}-${payload.resource_uuid ?? payload.entity_uuid ?? Date.now()}`
    const resourceUuid = payload.resource_uuid ?? payload.entity_uuid ?? payload.company_uuid

    const admin = getAdmin()

    const { data: existing } = await admin
      .from('gusto_webhook_events')
      .select('id')
      .eq('event_uuid', eventUuid)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await admin.from('gusto_webhook_events').insert({
      event_uuid: eventUuid,
      event_type: eventType,
      resource_uuid: resourceUuid ?? null,
      payload,
    })

    if (eventType === 'company.approved' && payload.company_uuid) {
      await admin
        .from('gusto_companies')
        .update({
          approved_at: new Date().toISOString(),
          onboarding_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('company_uuid', payload.company_uuid)
    }

    if (
      (eventType === 'payroll.paid' || eventType === 'payroll.processed') &&
      resourceUuid
    ) {
      const { data: run } = await admin
        .from('payroll_runs')
        .select('id, pay_period_close_id, net_pay_cents')
        .eq('gusto_payroll_uuid', resourceUuid)
        .maybeSingle()

      if (run) {
        const paidAt = new Date().toISOString()
        await admin
          .from('payroll_runs')
          .update({ status: 'paid', paid_at: paidAt, updated_at: paidAt })
          .eq('id', run.id)

        await admin
          .from('pay_period_closes')
          .update({
            paid_at: paidAt,
            paid_amount_cents: run.net_pay_cents,
          })
          .eq('id', run.pay_period_close_id)

        await admin
          .from('gusto_webhook_events')
          .update({ processed_at: paidAt })
          .eq('event_uuid', eventUuid)
      }
    }

    if (eventType === 'payroll.failed' && resourceUuid) {
      await admin
        .from('payroll_runs')
        .update({
          status: 'failed',
          error_message: 'Gusto reported payroll failure',
          updated_at: new Date().toISOString(),
        })
        .eq('gusto_payroll_uuid', resourceUuid)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('gusto-webhook:', e)
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
