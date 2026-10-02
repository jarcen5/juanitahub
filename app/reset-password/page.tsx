'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setReady(Boolean(data.session))
      setChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
      setChecking(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setComplete(true)
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Your password has been updated successfully. You can return to Juanita Hub and sign in with your new password.')
  }

  if (checking) {
    return <main className="login-wrap"><div className="card login-card">Checking your reset link…</div></main>
  }

  if (!ready) {
    return (
      <main className="login-wrap auth-recovery-page">
        <section className="card login-card auth-recovery-card">
          <div className="auth-recovery-mark" aria-hidden="true">JH</div>
          <h1>Reset link unavailable</h1>
          <p className="subtle">This reset link may have expired or already been used. Request a new one and try again.</p>
          <Link className="primary auth-recovery-link-button" href="/forgot-password">Request a new reset link</Link>
          <Link className="auth-recovery-back" href="/">← Back to staff sign-in</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="login-wrap auth-recovery-page">
      <section className="card login-card auth-recovery-card">
        <div className="auth-recovery-mark" aria-hidden="true">JH</div>
        <h1>Choose a new password</h1>
        <p className="subtle">Create a new password for your Juanita Hub staff account.</p>

        {!complete ? (
          <form className="auth-recovery-form" onSubmit={updatePassword}>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            {error && <div className="notice auth-recovery-error">{error}</div>}
            {message && <div className="notice auth-recovery-success">{message}</div>}

            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Updating password…' : 'Update password'}
            </button>
          </form>
        ) : (
          <>
            <div className="notice auth-recovery-success">{message}</div>
            <Link className="primary auth-recovery-link-button" href="/">Return to Juanita Hub</Link>
          </>
        )}
      </section>
    </main>
  )
}
