'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function sendReset(event: FormEvent) {
    event.preventDefault()
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Enter your staff email address.')
      return
    }

    setSending(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo })

    setSending(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setMessage('If an account uses that email address, a password reset link has been sent. Check your inbox and spam folder.')
  }

  return (
    <main className="login-wrap auth-recovery-page">
      <section className="card login-card auth-recovery-card">
        <div className="auth-recovery-mark" aria-hidden="true">JH</div>
        <h1>Reset your password</h1>
        <p className="subtle">Enter the email address you use for Juanita Hub. We’ll email you a secure link to choose a new password.</p>

        <form className="auth-recovery-form" onSubmit={sendReset}>
          <div className="field">
            <label htmlFor="reset-email">Staff email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>

          {error && <div className="notice auth-recovery-error">{error}</div>}
          {message && <div className="notice auth-recovery-success">{message}</div>}

          <button className="primary" type="submit" disabled={sending}>
            {sending ? 'Sending reset link…' : 'Send reset link'}
          </button>
        </form>

        <Link className="auth-recovery-back" href="/">← Back to staff sign-in</Link>
      </section>
    </main>
  )
}
