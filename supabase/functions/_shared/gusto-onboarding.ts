import { gustoFetch, getGustoEnv, mapGustoOnboardingToStatus, parseGustoJson } from './gusto.ts'
import { getServiceSupabase, withFreshCompanyToken } from './supabase.ts'
import { isEinAlreadyInUseError, normalizeEin } from './gusto-ein.ts'

type AddressInput = {
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
}

function toGustoAddress(input: AddressInput) {
  return {
    street_1: input.street1.trim(),
    street_2: input.street2?.trim() || undefined,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
    country: 'USA',
  }
}

function normalizeUsPhone(value?: string): string | null {
  if (!value?.trim()) return null
  let digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return null
  return digits
}

async function syncOnboardingRecord(householdId: string) {
  const result = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/onboarding_status`, { token })
    return parseGustoJson<{ onboarding_steps: Record<string, { completed?: boolean; title?: string }> }>(res)
  })

  const admin = getServiceSupabase()
  const { data: row } = await admin
    .from('gusto_companies')
    .select('approved_at')
    .eq('household_id', householdId)
    .maybeSingle()

  const status = mapGustoOnboardingToStatus(result.onboarding_steps, row?.approved_at ?? null)
  await admin
    .from('gusto_companies')
    .update({
      onboarding_status: status,
      onboarding_steps: result.onboarding_steps,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', householdId)

  return { onboardingStatus: status, steps: result.onboarding_steps }
}

export async function handleGetSetup(householdId: string) {
  return withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const fetchJson = async <T>(path: string) => {
      const res = await gustoFetch(path, { token })
      return parseGustoJson<T>(res)
    }

    const [
      onboarding,
      locations,
      bankAccounts,
      federalTax,
      industry,
      paySchedules,
      signatories,
      forms,
      employees,
    ] = await Promise.all([
      fetchJson<{ onboarding_steps: Record<string, { completed?: boolean; title?: string }> }>(
        `/v1/companies/${companyUuid}/onboarding_status`,
      ),
      fetchJson<unknown[]>(`/v1/companies/${companyUuid}/locations`).catch(() => []),
      fetchJson<unknown[]>(`/v1/companies/${companyUuid}/bank_accounts`).catch(() => []),
      fetchJson<Record<string, unknown>>(`/v1/companies/${companyUuid}/federal_tax_details`).catch(() => null),
      fetchJson<Record<string, unknown>>(`/v1/companies/${companyUuid}/industry_selection`).catch(() => null),
      fetchJson<unknown[]>(`/v1/companies/${companyUuid}/pay_schedules`).catch(() => []),
      fetchJson<unknown[]>(`/v1/companies/${companyUuid}/signatories`).catch(() => []),
      fetchJson<unknown[]>(`/v1/companies/${companyUuid}/forms`).catch(() => []),
      fetchJson<Array<{ uuid: string }>>(`/v1/companies/${companyUuid}/employees`).catch(() => []),
    ])

    const locationList = Array.isArray(locations) ? locations : []
    const employeeList = Array.isArray(employees) ? employees : []
    const stateSet = new Set<string>()

    for (const loc of locationList) {
      const state = (loc as { state?: string }).state
      if (state) stateSet.add(state)
    }

    for (const employee of employeeList) {
      try {
        const workAddresses = await fetchJson<
          Array<{ state?: string; location?: { state?: string } }>
        >(`/v1/employees/${employee.uuid}/work_addresses`)
        for (const workAddress of workAddresses) {
          const state = workAddress.state ?? workAddress.location?.state
          if (state) stateSet.add(state)
        }
      } catch {
        /* employee may not have work addresses yet */
      }
    }

    const stateRequirements: Record<string, unknown> = {}
    for (const state of stateSet) {
      try {
        stateRequirements[state] = await fetchJson(`/v1/companies/${companyUuid}/tax_requirements/${state}`)
      } catch {
        /* state may not be ready yet */
      }
    }

    return {
      onboardingSteps: onboarding.onboarding_steps ?? {},
      locations: locationList,
      bankAccounts: Array.isArray(bankAccounts) ? bankAccounts : [],
      federalTax,
      industry,
      paySchedules: Array.isArray(paySchedules) ? paySchedules : [],
      signatories: Array.isArray(signatories) ? signatories : [],
      forms: Array.isArray(forms) ? forms : [],
      stateRequirements,
      gustoEnv: getGustoEnv(),
    }
  })
}

export async function handleSaveLocation(
  householdId: string,
  body: AddressInput & { phone?: string },
) {
  const phone = normalizeUsPhone(body.phone)
  if (!phone) {
    throw new Error('Phone number is required for your business address')
  }

  const location = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/locations`, {
      method: 'POST',
      token,
      body: {
        ...toGustoAddress(body),
        phone_number: phone,
        mailing_address: true,
        filing_address: true,
      },
    })
    return parseGustoJson<{ uuid: string }>(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return { locationUuid: location.uuid, ...sync }
}

export async function handleSaveBankAccount(
  householdId: string,
  body: {
    routingNumber: string
    accountNumber: string
    accountType: 'Checking' | 'Savings'
    name?: string
  },
) {
  const bankAccount = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/bank_accounts`, {
      method: 'POST',
      token,
      body: {
        routing_number: body.routingNumber.replace(/\D/g, ''),
        account_number: body.accountNumber.replace(/\D/g, ''),
        account_type: body.accountType,
        name: body.name?.trim() || 'Payroll account',
      },
    })
    return parseGustoJson<{ uuid: string; verification_status?: string }>(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return { bankAccountUuid: bankAccount.uuid, verificationStatus: bankAccount.verification_status, ...sync }
}

export async function handleSaveFederalTax(
  householdId: string,
  body: {
    legalName: string
    ein: string
    taxPayerType: string
    filingForm: '941' | '944'
  },
) {
  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const loadCurrent = async () => {
      const currentRes = await gustoFetch(`/v1/companies/${companyUuid}/federal_tax_details`, { token })
      return parseGustoJson<{
        version: string
        has_ein?: boolean
        legal_name?: string | null
      }>(currentRes)
    }

    const putFederalTax = async (payload: Record<string, unknown>) => {
      const res = await gustoFetch(`/v1/companies/${companyUuid}/federal_tax_details`, {
        method: 'PUT',
        token,
        body: payload,
      })
      await parseGustoJson(res)
    }

    const current = await loadCurrent()
    const payload: Record<string, unknown> = {
      version: current.version,
      legal_name: body.legalName.trim(),
      tax_payer_type: body.taxPayerType,
      filing_form: body.filingForm,
    }

    if (!current.has_ein) {
      const ein = normalizeEin(body.ein)
      if (!ein) throw new Error('EIN is required for federal tax setup')
      payload.ein = ein
    }

    try {
      await putFederalTax(payload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isEinAlreadyInUseError(msg) && payload.ein) {
        const refreshed = await loadCurrent()
        const { ein: _omit, ...withoutEin } = payload
        await putFederalTax({ ...withoutEin, version: refreshed.version })
        return
      }
      if (isEinAlreadyInUseError(msg)) {
        throw new Error(
          'That EIN is already registered in Gusto. It was set when you created your company — leave EIN blank and save again, or use a different EIN when creating a new company.',
        )
      }
      throw e
    }
  })

  const sync = await syncOnboardingRecord(householdId)
  return sync
}

export async function handleSaveIndustry(
  householdId: string,
  body: { naicsCode: string; sicCodes?: string[] },
) {
  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/industry_selection`, {
      method: 'PUT',
      token,
      body: {
        naics_code: body.naicsCode.replace(/\D/g, ''),
        sic_codes: body.sicCodes?.length ? body.sicCodes : ['8811'],
      },
    })
    await parseGustoJson(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return sync
}

export async function handleSavePaySchedule(
  householdId: string,
  body: {
    frequency: string
    anchorPayDate: string
    anchorEndOfPayPeriod: string
    name?: string
  },
) {
  const schedule = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/pay_schedules`, {
      method: 'POST',
      token,
      body: {
        frequency: body.frequency,
        anchor_pay_date: body.anchorPayDate,
        anchor_end_of_pay_period: body.anchorEndOfPayPeriod,
        name: body.name?.trim() || 'Default pay schedule',
      },
    })
    return parseGustoJson<{ uuid: string }>(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return { payScheduleUuid: schedule.uuid, ...sync }
}

export async function handleSaveSignatory(
  householdId: string,
  body: {
    firstName: string
    lastName: string
    title: string
    email: string
    phone?: string
    birthday?: string
    homeAddress: AddressInput
  },
) {
  const signatory = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/signatories`, {
      method: 'POST',
      token,
      body: {
        first_name: body.firstName.trim(),
        last_name: body.lastName.trim(),
        title: body.title.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || undefined,
        birthday: body.birthday || undefined,
        home_address: toGustoAddress(body.homeAddress),
      },
    })
    return parseGustoJson<{ uuid: string; identity_verification_status?: string }>(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return { signatoryUuid: signatory.uuid, identityVerificationStatus: signatory.identity_verification_status, ...sync }
}

export async function handleVerifyBankAccount(
  householdId: string,
  body: { bankAccountUuid?: string; deposit1?: number; deposit2?: number; sendTestDeposits?: boolean },
) {
  const result = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const listRes = await gustoFetch(`/v1/companies/${companyUuid}/bank_accounts`, { token })
    const accounts = await parseGustoJson<Array<{ uuid: string; verification_status?: string }>>(listRes)

    let bankAccountUuid = body.bankAccountUuid?.trim()
    let account = bankAccountUuid ? accounts.find((a) => a.uuid === bankAccountUuid) : accounts[0]
    if (!bankAccountUuid) {
      bankAccountUuid = accounts[0]?.uuid
      account = accounts[0]
    }

    if (!bankAccountUuid) throw new Error('No bank account found to verify')

    if (account?.verification_status === 'verified') {
      return {
        bankAccountUuid,
        verificationStatus: 'verified',
        verified: true,
      }
    }

    const isDemo = getGustoEnv() === 'demo'
    const useDemoDeposits = isDemo && body.sendTestDeposits !== false

    if (useDemoDeposits) {
      const testRes = await gustoFetch(
        `/v1/companies/${companyUuid}/bank_accounts/${bankAccountUuid}/send_test_deposits`,
        { method: 'POST', token, body: {} },
      )
      const testDeposits = await parseGustoJson<{ deposit_1?: number; deposit_2?: number }>(testRes)
      if (testDeposits.deposit_1 == null || testDeposits.deposit_2 == null) {
        throw new Error('Gusto demo did not return test deposit amounts. Try again in a moment.')
      }

      const verifyRes = await gustoFetch(
        `/v1/companies/${companyUuid}/bank_accounts/${bankAccountUuid}/verify`,
        {
          method: 'PUT',
          token,
          body: { deposit_1: testDeposits.deposit_1, deposit_2: testDeposits.deposit_2 },
        },
      )
      const verified = await parseGustoJson<{ verification_status?: string }>(verifyRes)
      return {
        bankAccountUuid,
        verificationStatus: verified.verification_status ?? 'verified',
        verified: verified.verification_status === 'verified',
      }
    }

    if (account?.verification_status === 'awaiting_deposits') {
      throw new Error(
        'Micro-deposits have not arrived yet. Check back in 1–2 business days, then enter both deposit amounts.',
      )
    }

    if (body.deposit1 == null || body.deposit2 == null) {
      throw new Error('Enter both micro-deposit amounts from your bank statement.')
    }

    const verifyRes = await gustoFetch(
      `/v1/companies/${companyUuid}/bank_accounts/${bankAccountUuid}/verify`,
      {
        method: 'PUT',
        token,
        body: {
          deposit_1: body.deposit1,
          deposit_2: body.deposit2,
        },
      },
    )
    const verified = await parseGustoJson<{ verification_status?: string }>(verifyRes)
    return {
      bankAccountUuid,
      verificationStatus: verified.verification_status ?? 'verified',
      verified: verified.verification_status === 'verified',
    }
  })

  const sync = await syncOnboardingRecord(householdId)
  return { ...result, ...sync }
}

export async function handleSaveStateTax(
  householdId: string,
  body: {
    state: string
    requirementSets: Array<{
      key: string
      state: string
      effective_from: string | null
      requirements: Array<{ key: string; value: string | boolean | number | null }>
    }>
  },
) {
  const state = body.state.trim().toUpperCase()
  if (!state) throw new Error('State is required')
  if (!body.requirementSets.length) throw new Error('At least one state tax field is required')

  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/tax_requirements/${state}`, {
      method: 'PUT',
      token,
      body: {
        requirement_sets: body.requirementSets,
      },
    })
    await parseGustoJson(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return sync
}

export async function handleSignForms(householdId: string) {
  const signed = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const formsRes = await gustoFetch(`/v1/companies/${companyUuid}/forms`, { token })
    const forms = await parseGustoJson<Array<{ uuid: string; requires_signing?: boolean; signed?: boolean }>>(
      formsRes,
    )

    const toSign = forms.filter((f) => f.requires_signing && !f.signed)
    const signedUuids: string[] = []

    for (const form of toSign) {
      const signRes = await gustoFetch(`/v1/forms/${form.uuid}/sign`, {
        method: 'PUT',
        token,
        body: {},
      })
      await parseGustoJson(signRes)
      signedUuids.push(form.uuid)
    }

    return { signedCount: signedUuids.length, signedFormUuids: signedUuids }
  })

  const sync = await syncOnboardingRecord(householdId)
  return { ...signed, ...sync }
}

export async function handleFinishOnboarding(householdId: string) {
  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/finish_onboarding`, {
      method: 'PUT',
      token,
      body: {},
    })
    await parseGustoJson(res)
  })

  const sync = await syncOnboardingRecord(householdId)
  return sync
}

async function loadHouseholdNanny(householdId: string, householdNannyId: string) {
  const admin = getServiceSupabase()
  const { data: nanny } = await admin
    .from('household_nannies')
    .select('id, first_name, last_name, email, start_date, user_id')
    .eq('id', householdNannyId)
    .eq('household_id', householdId)
    .single()
  if (!nanny) throw new Error('Nanny not found')
  return nanny
}

async function loadHourlyRateCents(householdNannyId: string, override?: number) {
  if (override != null) return override
  const admin = getServiceSupabase()
  const { data: settings } = await admin
    .from('employment_settings')
    .select('hourly_rate_cents')
    .eq('household_nanny_id', householdNannyId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return settings?.hourly_rate_cents ?? 0
}

async function putGustoEmployeeOnboardingStatus(
  token: string,
  employeeUuid: string,
  onboardingStatus: string,
) {
  const res = await gustoFetch(`/v1/employees/${employeeUuid}/onboarding_status`, {
    method: 'PUT',
    token,
    body: { onboarding_status: onboardingStatus },
  })
  return parseGustoJson<{ onboarding_status?: string }>(res)
}

async function updateGustoEmployeePersonalInfo(
  token: string,
  employeeUuid: string,
  body: { dateOfBirth?: string; ssn?: string },
) {
  const getRes = await gustoFetch(`/v1/employees/${employeeUuid}`, { token })
  const current = await parseGustoJson<{ version?: string }>(getRes)
  const payload: Record<string, unknown> = { version: current.version }
  if (body.dateOfBirth) payload.date_of_birth = body.dateOfBirth
  if (body.ssn) payload.ssn = body.ssn.replace(/\D/g, '')
  const updateRes = await gustoFetch(`/v1/employees/${employeeUuid}`, {
    method: 'PUT',
    token,
    body: payload,
  })
  await parseGustoJson(updateRes)
}

async function upsertGustoEmployeeHomeAddress(
  token: string,
  employeeUuid: string,
  homeAddress: AddressInput,
) {
  const homeGetRes = await gustoFetch(`/v1/employees/${employeeUuid}/home_address`, { token })
  let homeVersion: string | undefined
  try {
    const currentHome = await parseGustoJson<{ version?: string }>(homeGetRes)
    homeVersion = currentHome.version
  } catch {
    /* no home address yet */
  }

  const homeBody: Record<string, unknown> = toGustoAddress(homeAddress)
  if (homeVersion) homeBody.version = homeVersion

  const homeRes = await gustoFetch(`/v1/employees/${employeeUuid}/home_address`, {
    method: 'PUT',
    token,
    body: homeBody,
  })
  await parseGustoJson(homeRes)
}

async function ensureGustoEmployeeEmployment(
  token: string,
  companyUuid: string,
  employeeUuid: string,
  params: {
    locationUuid?: string
    hireDate?: string
    jobTitle?: string
    hourlyRateCents: number
    fallbackHireDate?: string | null
  },
) {
  let locUuid = params.locationUuid?.trim()
  if (!locUuid) {
    const locRes = await gustoFetch(`/v1/companies/${companyUuid}/locations`, { token })
    const locations = await parseGustoJson<Array<{ uuid: string }>>(locRes)
    locUuid = locations[0]?.uuid
  }
  if (!locUuid) throw new Error('Add a company address in Gusto setup before linking a nanny')

  const hireDate = params.hireDate ?? params.fallbackHireDate ?? new Date().toISOString().slice(0, 10)
  const hourlyRate = (params.hourlyRateCents / 100).toFixed(2)

  try {
    const workRes = await gustoFetch(`/v1/employees/${employeeUuid}/work_addresses`, {
      method: 'POST',
      token,
      body: { location_uuid: locUuid, effective_date: hireDate },
    })
    await parseGustoJson(workRes)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('422') && !msg.includes('already')) throw e
  }

  const jobsRes = await gustoFetch(`/v1/employees/${employeeUuid}/jobs`, { token })
  const jobs = await parseGustoJson<Array<{ uuid: string; compensations?: Array<{ uuid: string; version?: string }> }>>(
    jobsRes,
  )

  let job = jobs[0]
  if (!job) {
    const jobRes = await gustoFetch(`/v1/employees/${employeeUuid}/jobs`, {
      method: 'POST',
      token,
      body: { title: params.jobTitle?.trim() || 'Nanny', hire_date: hireDate },
    })
    job = await parseGustoJson<{ uuid: string; compensations?: Array<{ uuid: string; version?: string }> }>(jobRes)
  }

  const compensation = job.compensations?.[0]
  if (compensation?.uuid) {
    const compRes = await gustoFetch(`/v1/compensations/${compensation.uuid}`, {
      method: 'PUT',
      token,
      body: {
        version: compensation.version,
        rate: hourlyRate,
        payment_unit: 'Hour',
        flsa_status: 'Nonexempt',
      },
    })
    await parseGustoJson(compRes)
  }

  return locUuid
}

async function inviteGustoEmployeeToSelfOnboard(token: string, employeeUuid: string) {
  const statusRes = await gustoFetch(`/v1/employees/${employeeUuid}/onboarding_status`, { token })
  const current = await parseGustoJson<{ onboarding_status?: string }>(statusRes)
  const status = current.onboarding_status ?? 'admin_onboarding_incomplete'

  if (status === 'onboarding_completed') return

  if (status === 'admin_onboarding_incomplete') {
    await putGustoEmployeeOnboardingStatus(token, employeeUuid, 'self_onboarding_pending_invite')
  }

  if (
    status === 'admin_onboarding_incomplete' ||
    status === 'self_onboarding_pending_invite' ||
    status === 'self_onboarding_invited' ||
    status === 'self_onboarding_invited_started' ||
    status === 'self_onboarding_invited_overdue'
  ) {
    await putGustoEmployeeOnboardingStatus(token, employeeUuid, 'self_onboarding_invited')
  }
}

async function finalizeGustoEmployeeOnboarding(token: string, employeeUuid: string) {
  const statusRes = await gustoFetch(`/v1/employees/${employeeUuid}/onboarding_status`, { token })
  const current = await parseGustoJson<{ onboarding_status?: string }>(statusRes)
  const status = current.onboarding_status ?? 'admin_onboarding_incomplete'

  if (status === 'self_onboarding_completed_by_employee') {
    await putGustoEmployeeOnboardingStatus(token, employeeUuid, 'self_onboarding_awaiting_admin_review')
  }

  await putGustoEmployeeOnboardingStatus(token, employeeUuid, 'onboarding_completed')
}

export async function handleSetupGustoEmployee(
  householdId: string,
  body: {
    householdNannyId: string
    locationUuid?: string
    dateOfBirth?: string
    ssn?: string
    homeAddress?: AddressInput
    hireDate?: string
    jobTitle?: string
    hourlyRateCents?: number
    markOnboardingComplete?: boolean
  },
) {
  const admin = getServiceSupabase()
  const nanny = await loadHouseholdNanny(householdId, body.householdNannyId)
  const hourlyRateCents = await loadHourlyRateCents(nanny.id, body.hourlyRateCents)

  let employeeUuid: string | null = null

  const { data: existingLink } = await admin
    .from('gusto_employees')
    .select('employee_uuid, onboarding_status')
    .eq('household_nanny_id', nanny.id)
    .maybeSingle()

  employeeUuid = existingLink?.employee_uuid ?? null

  if (!employeeUuid) {
    const created = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
      const res = await gustoFetch(`/v1/companies/${companyUuid}/employees`, {
        method: 'POST',
        token,
        body: {
          first_name: nanny.first_name,
          last_name: nanny.last_name,
          email: nanny.email,
          date_of_birth: body.dateOfBirth || undefined,
          ssn: body.ssn?.replace(/\D/g, '') || undefined,
          self_onboarding: false,
        },
      })
      return parseGustoJson<{ uuid: string }>(res)
    })
    employeeUuid = created.uuid

    await admin.from('gusto_employees').upsert(
      {
        household_nanny_id: nanny.id,
        household_id: householdId,
        employee_uuid: employeeUuid,
        worker_type: 'employee',
        onboarding_status: 'created',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_nanny_id' },
    )
  } else if (body.dateOfBirth || body.ssn) {
    await withFreshCompanyToken(householdId, async (token) => {
      await updateGustoEmployeePersonalInfo(token, employeeUuid!, {
        dateOfBirth: body.dateOfBirth,
        ssn: body.ssn,
      })
    })
  }

  const locationUuid = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const locUuid = await ensureGustoEmployeeEmployment(token, companyUuid, employeeUuid!, {
      locationUuid: body.locationUuid,
      hireDate: body.hireDate,
      jobTitle: body.jobTitle,
      hourlyRateCents,
      fallbackHireDate: nanny.start_date,
    })

    if (body.homeAddress) {
      await upsertGustoEmployeeHomeAddress(token, employeeUuid!, body.homeAddress)
    }

    if (body.markOnboardingComplete !== false) {
      await putGustoEmployeeOnboardingStatus(token, employeeUuid!, 'onboarding_completed')
    }

    return locUuid
  })

  await admin
    .from('gusto_employees')
    .update({
      onboarding_status: body.markOnboardingComplete === false ? 'admin_in_progress' : 'onboarding_completed',
      updated_at: new Date().toISOString(),
    })
    .eq('household_nanny_id', nanny.id)

  const sync = await syncOnboardingRecord(householdId)
  return { employeeUuid, locationUuid, ...sync }
}

export async function handleInviteGustoEmployeeSelfOnboarding(
  householdId: string,
  body: {
    householdNannyId: string
    locationUuid?: string
    hireDate?: string
    jobTitle?: string
    hourlyRateCents?: number
  },
) {
  const admin = getServiceSupabase()
  const nanny = await loadHouseholdNanny(householdId, body.householdNannyId)
  if (!nanny.email?.trim()) throw new Error('Add an email to the nanny profile before inviting them to complete payroll info')

  const hourlyRateCents = await loadHourlyRateCents(nanny.id, body.hourlyRateCents)

  const { data: existingLink } = await admin
    .from('gusto_employees')
    .select('employee_uuid, onboarding_status')
    .eq('household_nanny_id', nanny.id)
    .maybeSingle()

  if (existingLink?.onboarding_status === 'onboarding_completed') {
    throw new Error('This nanny is already set up in Gusto')
  }

  let employeeUuid = existingLink?.employee_uuid ?? null

  if (!employeeUuid) {
    const created = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
      const res = await gustoFetch(`/v1/companies/${companyUuid}/employees`, {
        method: 'POST',
        token,
        body: {
          first_name: nanny.first_name,
          last_name: nanny.last_name,
          email: nanny.email.trim().toLowerCase(),
          self_onboarding: true,
        },
      })
      return parseGustoJson<{ uuid: string }>(res)
    })
    employeeUuid = created.uuid
  }

  const locationUuid = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    await ensureGustoEmployeeEmployment(token, companyUuid, employeeUuid!, {
      locationUuid: body.locationUuid,
      hireDate: body.hireDate,
      jobTitle: body.jobTitle,
      hourlyRateCents,
      fallbackHireDate: nanny.start_date,
    })
    await inviteGustoEmployeeToSelfOnboard(token, employeeUuid!)
    return body.locationUuid
  })

  await admin.from('gusto_employees').upsert(
    {
      household_nanny_id: nanny.id,
      household_id: householdId,
      employee_uuid: employeeUuid,
      worker_type: 'employee',
      onboarding_status: 'awaiting_nanny',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_nanny_id' },
  )

  if (nanny.user_id) {
    const { data: household } = await admin.from('households').select('name').eq('id', householdId).single()
    await admin.rpc('create_household_notification', {
      p_household_id: householdId,
      p_category: 'payroll',
      p_title: 'Complete your payroll information',
      p_body: `${household?.name ?? 'Your employer'} needs your date of birth, SSN, and home address for payroll.`,
      p_link: '/payroll',
      p_metadata: null,
      p_exclude_user_id: null,
      p_target_user_ids: [nanny.user_id],
    })
  }

  const sync = await syncOnboardingRecord(householdId)
  return {
    employeeUuid,
    locationUuid,
    awaitingNannyLogin: !nanny.user_id,
    ...sync,
  }
}

export async function handleSubmitGustoEmployeeSelfOnboarding(
  householdId: string,
  householdNannyId: string,
  body: {
    dateOfBirth: string
    ssn: string
    homeAddress: AddressInput
  },
) {
  if (!body.dateOfBirth?.trim()) throw new Error('Date of birth is required')
  if (!body.ssn?.replace(/\D/g, '')) throw new Error('SSN is required')
  if (!body.homeAddress?.street1?.trim() || !body.homeAddress.city?.trim() || !body.homeAddress.state?.trim()) {
    throw new Error('Home address is required')
  }

  const admin = getServiceSupabase()
  const { data: link } = await admin
    .from('gusto_employees')
    .select('employee_uuid, onboarding_status')
    .eq('household_id', householdId)
    .eq('household_nanny_id', householdNannyId)
    .maybeSingle()

  if (!link?.employee_uuid) {
    throw new Error('Payroll setup has not been started yet. Ask your employer to send you the payroll form.')
  }

  if (link.onboarding_status === 'onboarding_completed') {
    return { employeeUuid: link.employee_uuid, alreadyComplete: true }
  }

  await withFreshCompanyToken(householdId, async (token) => {
    await updateGustoEmployeePersonalInfo(token, link.employee_uuid!, {
      dateOfBirth: body.dateOfBirth,
      ssn: body.ssn,
    })
    await upsertGustoEmployeeHomeAddress(token, link.employee_uuid!, body.homeAddress)
    await putGustoEmployeeOnboardingStatus(token, link.employee_uuid!, 'self_onboarding_completed_by_employee')
  })

  await admin
    .from('gusto_employees')
    .update({ onboarding_status: 'awaiting_admin_review', updated_at: new Date().toISOString() })
    .eq('household_nanny_id', householdNannyId)

  const sync = await syncOnboardingRecord(householdId)
  return { employeeUuid: link.employee_uuid, ...sync }
}

export async function handleFinalizeGustoEmployeeOnboarding(
  householdId: string,
  body: { householdNannyId: string },
) {
  const admin = getServiceSupabase()
  await loadHouseholdNanny(householdId, body.householdNannyId)

  const { data: link } = await admin
    .from('gusto_employees')
    .select('employee_uuid, onboarding_status')
    .eq('household_id', householdId)
    .eq('household_nanny_id', body.householdNannyId)
    .maybeSingle()

  if (!link?.employee_uuid) throw new Error('Nanny is not linked in Gusto yet')

  await withFreshCompanyToken(householdId, async (token) => {
    await finalizeGustoEmployeeOnboarding(token, link.employee_uuid!)
  })

  await admin
    .from('gusto_employees')
    .update({ onboarding_status: 'onboarding_completed', updated_at: new Date().toISOString() })
    .eq('household_nanny_id', body.householdNannyId)

  const sync = await syncOnboardingRecord(householdId)
  return { employeeUuid: link.employee_uuid, ...sync }
}
