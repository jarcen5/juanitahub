'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type LabDevice = {
  id: string
  label: string | null
  enabled: boolean
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_by_name: string
  active_sessions: number
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function relativeUse(value: string | null) {
  if (!value) return 'Never used'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60_000))
  if (minutes < 1) return 'Used just now'
  if (minutes < 60) return `Used ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Used ${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Used ${days} day${days === 1 ? '' : 's'} ago`
  return 'Last used ' + new Date(value).toLocaleDateString()
}

export default function LabDeviceManagementPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [devices, setDevices] = useState<LabDevice[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session) void loadDevices()
    else setLoading(false)
  }, [session])

  async function loadDevices() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const profileResult = await supabase
      .from('staff_profiles')
      .select('display_name,role,active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const nextProfile = profileResult.data as StaffProfile | null
    setProfile(nextProfile)

    if (profileResult.error) {
      setMessage(profileResult.error.message)
      setLoading(false)
      return
    }

    if (!nextProfile?.active || nextProfile.role !== 'admin') {
      setLoading(false)
      return
    }

    const result = await supabase.rpc('admin_list_learning_lab_devices')
    if (result.error) {
      setMessage(result.error.message)
      setLoading(false)
      return
    }

    const nextDevices = ((result.data ?? []) as LabDevice[]).map((device) => ({
      ...device,
      active_sessions: Number(device.active_sessions ?? 0),
    }))
    setDevices(nextDevices)
    setDrafts(Object.fromEntries(nextDevices.map((device) => [device.id, device.label ?? ''])))
    setLoading(false)
  }

  const activeDevices = useMemo(
    () => devices.filter((device) => device.enabled && !device.revoked_at),
    [devices],
  )

  const revokedDevices = useMemo(
    () => devices.filter((device) => !device.enabled || Boolean(device.revoked_at)),
    [devices],
  )

  const activeSessions = useMemo(
    () => activeDevices.reduce((sum, device) => sum + device.active_sessions, 0),
    [activeDevices],
  )

  const usedRecently = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return activeDevices.filter((device) => device.last_used_at && new Date(device.last_used_at).getTime() >= cutoff).length
  }, [activeDevices])

  async function renameDevice(device: LabDevice) {
    if (busyId || profile?.role !== 'admin') return
    const label = (drafts[device.id] ?? '').trim()
    if (!label) {
      setMessage('Enter a device name before saving.')
      return
    }

    setBusyId(device.id)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_rename_learning_lab_device', {
      p_device_id: device.id,
      p_label: label,
    })
    if (error || !data) {
      setMessage(error?.message ?? 'The device name could not be updated.')
      setBusyId(null)
      return
    }

    await loadDevices()
    setMessage('Device name updated.')
    setBusyId(null)
  }

  async function revokeDevice(device: LabDevice) {
    if (busyId || profile?.role !== 'admin') return
    const label = device.label?.trim() || 'this computer'
    const sessionText = device.active_sessions
      ? ` It also has ${device.active_sessions} active student session${device.active_sessions === 1 ? '' : 's'}, which will be signed out immediately.`
      : ''

    if (!window.confirm(`Revoke Student Learning access for ${label}?${sessionText} This cannot be undone; the computer must be activated again to regain access.`)) return

    setBusyId(device.id)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_revoke_learning_lab_device', {
      p_device_id: device.id,
    })
    if (error || !data) {
      setMessage(error?.message ?? 'The device could not be revoked.')
      setBusyId(null)
      return
    }

    await loadDevices()
    setMessage(`${label} was revoked. Any active Student Learning sessions on that device were signed out.`)
    setBusyId(null)
  }

  function DeviceCard({ device }: { device: LabDevice }) {
    const active = device.enabled && !device.revoked_at
    const busy = busyId === device.id
    const draft = drafts[device.id] ?? ''

    return (
      <article className={`lab-device-card ${active ? 'active' : 'revoked'}`}>
        <div className="lab-device-icon" aria-hidden="true">{active ? '💻' : '🔒'}</div>
        <div className="lab-device-main">
          <div className="lab-device-title-row">
            <div>
              <span className={`lab-device-status ${active ? 'active' : 'revoked'}`}>{active ? 'Active' : 'Revoked'}</span>
              <h3>{device.label?.trim() || 'Unnamed lab computer'}</h3>
            </div>
            {active && <span className="lab-device-use">{relativeUse(device.last_used_at)}</span>}
          </div>

          <div className="lab-device-facts">
            <div><small>Activated</small><strong>{formatDate(device.created_at)}</strong></div>
            <div><small>Activated by</small><strong>{device.created_by_name}</strong></div>
            <div><small>Last used</small><strong>{formatDate(device.last_used_at)}</strong></div>
            <div><small>{active ? 'Active sessions' : 'Revoked'}</small><strong>{active ? device.active_sessions : formatDate(device.revoked_at)}</strong></div>
          </div>

          {active && (
            <div className="lab-device-actions">
              <label className="field">
                <span>Device name</span>
                <input
                  value={draft}
                  maxLength={80}
                  placeholder="Example: Computer Lab • Station 1"
                  onChange={(event) => setDrafts((current) => ({ ...current, [device.id]: event.target.value }))}
                />
              </label>
              <button
                className="ghost"
                type="button"
                disabled={busy || !draft.trim() || draft.trim() === (device.label ?? '').trim()}
                onClick={() => void renameDevice(device)}
              >
                {busy ? 'Saving…' : 'Save name'}
              </button>
              <button
                className="lab-device-revoke"
                type="button"
                disabled={busy}
                onClick={() => void revokeDevice(device)}
              >
                Revoke access
              </button>
            </div>
          )}
        </div>
      </article>
    )
  }

  if (loading) return <main className="login-wrap"><div className="card login-card">Loading lab devices…</div></main>

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Sign in required</h1><p className="subtle">Sign in to Juanita Hub to manage Student Learning devices.</p></section></main>
  }

  if (!profile?.active || profile.role !== 'admin') {
    return <main className="login-wrap"><section className="card login-card"><h1>Admin access required</h1><p className="subtle">Only active Juanita Hub administrators can view or revoke Computer Lab devices.</p></section></main>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Computer Lab device access</small></div>
        <div className="toolbar"><span className="badge">Admin only</span></div>
      </header>

      <main className="main lab-device-page">
        <section className="hero lab-device-hero">
          <div>
            <span className="lab-device-eyebrow">Student Learning security</span>
            <h1>Computer Lab Devices</h1>
            <p className="subtle">See every browser that has been activated for Student Learning, give computers useful names, and revoke access immediately when a device should no longer be trusted.</p>
          </div>
          <button className="ghost" type="button" disabled={loading} onClick={() => void loadDevices()}>Refresh</button>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="lab-device-stats">
          <article className="card stat"><span className="subtle">Active devices</span><strong>{activeDevices.length}</strong><small>Can open Student Learning</small></article>
          <article className="card stat"><span className="subtle">Used in last 7 days</span><strong>{usedRecently}</strong><small>Recently active computers</small></article>
          <article className="card stat"><span className="subtle">Student sessions</span><strong>{activeSessions}</strong><small>Currently unexpired sessions</small></article>
          <article className="card stat"><span className="subtle">Revoked devices</span><strong>{revokedDevices.length}</strong><small>Historical access records</small></article>
        </section>

        <section className="card lab-device-security-note">
          <span aria-hidden="true">🛡️</span>
          <div><strong>Revoking a computer takes effect immediately.</strong><p>Its Student Learning credential stops working and any active student sessions tied to that device are removed. If the computer is trusted again later, activate it as a new device from Student Learning.</p></div>
        </section>

        <section className="lab-device-section">
          <div className="section-heading">
            <div><h2>Active devices</h2><p className="subtle">These computers can currently display the Student Learning roster and accept student sign-ins.</p></div>
            <span className="badge">{activeDevices.length}</span>
          </div>
          <div className="lab-device-list">
            {activeDevices.map((device) => <DeviceCard key={device.id} device={device} />)}
            {activeDevices.length === 0 && <div className="card empty">No Computer Lab devices are currently active.</div>}
          </div>
        </section>

        <section className="lab-device-section revoked-section">
          <div className="section-heading">
            <div><h2>Revoked history</h2><p className="subtle">Revoked credentials stay here for audit history but cannot be used again.</p></div>
            <span className="badge">{revokedDevices.length}</span>
          </div>
          <div className="lab-device-list">
            {revokedDevices.map((device) => <DeviceCard key={device.id} device={device} />)}
            {revokedDevices.length === 0 && <div className="card empty">No devices have been revoked.</div>}
          </div>
        </section>
      </main>
    </div>
  )
}
