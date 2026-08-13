'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = {
  user_id: string
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

type StaffAccount = {
  user_id: string
  email: string
  requested_name: string
  created_at: string
}

type Draft = {
  display_name: string
  role: 'staff' | 'admin'
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function StaffManagementPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profiles, setProfiles] = useState<StaffProfile[]>([])
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setAuthorized(false)
      setLoading(false)
      return
    }

    void loadStaff()
  }, [session])

  async function loadStaff() {
    if (!session) return

    setLoading(true)

    const { data: myProfile } = await supabase
      .from('staff_profiles')
      .select('role, active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!myProfile?.active || myProfile.role !== 'admin') {
      setAuthorized(false)
      setLoading(false)
      return
    }

    setAuthorized(true)

    const [profileResult, accountResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('user_id, display_name, role, active, approved_at, approved_by, created_at, updated_at')
        .order('created_at'),
      supabase
        .from('staff_accounts')
        .select('user_id, email, requested_name, created_at')
        .order('created_at'),
    ])

    if (profileResult.error || accountResult.error) {
      setMessage(profileResult.error?.message ?? accountResult.error?.message ?? 'Unable to load staff accounts.')
      setLoading(false)
      return
    }

    const nextProfiles = (profileResult.data ?? []) as StaffProfile[]
    setProfiles(nextProfiles)
    setAccounts((accountResult.data ?? []) as StaffAccount[])
    setDrafts(Object.fromEntries(nextProfiles.map((profile) => [
      profile.user_id,
      { display_name: profile.display_name, role: profile.role },
    ])))
    setLoading(false)
  }

  const accountByUser = useMemo(
    () => new Map(accounts.map((account) => [account.user_id, account])),
    [accounts],
  )

  const pending = useMemo(
    () => profiles.filter((profile) => !profile.active && !profile.approved_at),
    [profiles],
  )

  const activeStaff = useMemo(
    () => profiles.filter((profile) => profile.active),
    [profiles],
  )

  const deactivated = useMemo(
    () => profiles.filter((profile) => !profile.active && Boolean(profile.approved_at)),
    [profiles],
  )

  function updateDraft(userId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? { display_name: '', role: 'staff' }),
        ...patch,
      },
    }))
  }

  async function runStaffUpdate(
    profile: StaffProfile,
    draft: Draft,
    active: boolean,
    successMessage: string,
  ) {
    setBusyId(profile.user_id)
    setMessage('')

    const { error } = await supabase.rpc('manage_staff_profile', {
      p_user_id: profile.user_id,
      p_display_name: draft.display_name.trim(),
      p_role: draft.role,
      p_active: active,
    })

    if (error) {
      setMessage(error.message)
      setBusyId(null)
      return false
    }

    await loadStaff()
    setMessage(successMessage)
    setBusyId(null)
    return true
  }

  async function approve(profile: StaffProfile) {
    const draft = drafts[profile.user_id] ?? { display_name: profile.display_name, role: profile.role }
    if (!draft.display_name.trim()) {
      setMessage('Enter a staff display name before approving the account.')
      return
    }

    await runStaffUpdate(
      profile,
      draft,
      true,
      `${draft.display_name.trim()} was approved as ${draft.role === 'admin' ? 'an administrator' : 'staff'}.`,
    )
  }

  async function saveProfile(profile: StaffProfile) {
    const draft = drafts[profile.user_id] ?? { display_name: profile.display_name, role: profile.role }
    if (!draft.display_name.trim()) {
      setMessage('Display name cannot be blank.')
      return
    }

    const safeDraft = session?.user.id === profile.user_id
      ? { ...draft, role: profile.role }
      : draft

    await runStaffUpdate(
      profile,
      safeDraft,
      profile.active,
      `${safeDraft.display_name.trim()} is now ${safeDraft.role === 'admin' ? 'an administrator' : 'staff'}.`,
    )
  }

  async function deactivate(profile: StaffProfile) {
    if (session?.user.id === profile.user_id) return

    const draft = drafts[profile.user_id] ?? { display_name: profile.display_name, role: profile.role }
    const name = draft.display_name || profile.display_name
    if (!window.confirm(`Deactivate ${name}? They will immediately lose access to Juanita Hub, but their past activity remains intact.`)) return

    await runStaffUpdate(profile, draft, false, `${name} was deactivated.`)
  }

  async function reactivate(profile: StaffProfile) {
    const draft = drafts[profile.user_id] ?? { display_name: profile.display_name, role: profile.role }
    if (!draft.display_name.trim()) {
      setMessage('Display name cannot be blank.')
      return
    }

    await runStaffUpdate(profile, draft, true, `${draft.display_name.trim()} was reactivated.`)
  }

  function StaffRow({ profile, mode }: { profile: StaffProfile; mode: 'pending' | 'active' | 'deactivated' }) {
    const account = accountByUser.get(profile.user_id)
    const draft = drafts[profile.user_id] ?? { display_name: profile.display_name, role: profile.role }
    const isSelf = session?.user.id === profile.user_id
    const busy = busyId === profile.user_id

    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(220px, 1.5fr) auto', gap: 16, alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Display name {isSelf && <span className="badge">You</span>}</label>
            <input
              value={draft.display_name}
              onChange={(event) => updateDraft(profile.user_id, { display_name: event.target.value })}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Email</div>
            <div style={{ overflowWrap: 'anywhere' }}>{account?.email ?? 'Email unavailable'}</div>
            <div className="subtle" style={{ fontSize: 12, marginTop: 5 }}>
              Requested {formatDate(account?.created_at ?? profile.created_at)}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0, minWidth: 135 }}>
            <label>Role</label>
            <select
              value={draft.role}
              disabled={mode === 'active' && isSelf}
              onChange={(event) => updateDraft(profile.user_id, { role: event.target.value as 'staff' | 'admin' })}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <div className="subtle" style={{ fontSize: 12 }}>
            {mode === 'pending' && 'No child-data access until approved.'}
            {mode === 'active' && `Approved ${formatDate(profile.approved_at)}`}
            {mode === 'deactivated' && `Previously approved ${formatDate(profile.approved_at)}`}
          </div>

          <div className="toolbar">
            {mode === 'pending' && (
              <button className="primary" disabled={busy} onClick={() => approve(profile)}>
                {busy ? 'Approving…' : `Approve as ${draft.role === 'admin' ? 'Admin' : 'Staff'}`}
              </button>
            )}

            {mode === 'active' && (
              <>
                <button className="primary compact-button" disabled={busy} onClick={() => saveProfile(profile)}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  className="ghost compact-button"
                  disabled={busy || isSelf}
                  title={isSelf ? 'You cannot deactivate your own account here.' : undefined}
                  onClick={() => deactivate(profile)}
                >
                  Deactivate
                </button>
              </>
            )}

            {mode === 'deactivated' && (
              <button className="primary" disabled={busy} onClick={() => reactivate(profile)}>
                {busy ? 'Reactivating…' : 'Reactivate'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading || authorized === null) {
    return <main className="login-wrap"><div className="card login-card">Loading staff management…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1 style={{ fontSize: 30 }}>Sign in required</h1>
          <p className="subtle">Sign in to Juanita Hub first, then return to Staff Management.</p>
          <a className="primary" href="/" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to sign in</a>
        </section>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1 style={{ fontSize: 30 }}>Admin access required</h1>
          <p className="subtle">Only active Juanita Hub administrators can manage staff accounts.</p>
          <a className="primary" href="/" style={{ display: 'inline-block', textDecoration: 'none' }}>Return to Juanita Hub</a>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Staff access & approvals</small></div>
        <div className="toolbar"><span className="badge">Admin only</span></div>
      </header>

      <main className="main">
        <div className="hero">
          <div>
            <h1>Staff Management</h1>
            <p className="subtle">Approve new accounts, assign roles, and remove access when a staff member leaves.</p>
          </div>
        </div>

        {message && <div className="notice">{message}</div>}

        <section className="grid stats" style={{ marginBottom: 18 }}>
          <div className="card stat"><span className="subtle">Pending approval</span><strong>{pending.length}</strong></div>
          <div className="card stat"><span className="subtle">Active staff</span><strong>{activeStaff.length}</strong></div>
          <div className="card stat"><span className="subtle">Administrators</span><strong>{activeStaff.filter((staff) => staff.role === 'admin').length}</strong></div>
          <div className="card stat"><span className="subtle">Deactivated</span><strong>{deactivated.length}</strong></div>
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <h2>Pending approval</h2>
          <p className="subtle">These accounts can sign in to Supabase authentication, but RLS blocks all child and behavior data until you approve them here.</p>
          <div className="grid">
            {pending.map((profile) => <StaffRow key={profile.user_id} profile={profile} mode="pending" />)}
            {pending.length === 0 && <div className="empty">No staff accounts are waiting for approval.</div>}
          </div>
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <h2>Active staff</h2>
          <p className="subtle">Staff can record and correct behavior entries. Admins can also manage children, prizes, and staff access.</p>
          <div className="grid">
            {activeStaff.map((profile) => <StaffRow key={profile.user_id} profile={profile} mode="active" />)}
          </div>
        </section>

        <section className="card">
          <h2>Deactivated staff</h2>
          <p className="subtle">Deactivated accounts immediately lose access, but their prior behavior-entry and audit history stays preserved.</p>
          <div className="grid">
            {deactivated.map((profile) => <StaffRow key={profile.user_id} profile={profile} mode="deactivated" />)}
            {deactivated.length === 0 && <div className="empty">No staff accounts are deactivated.</div>}
          </div>
        </section>
      </main>
    </div>
  )
}
