'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './portal.module.css'

type PublicProgram = {
  public_id: string
  name: string
  program_type: string
  audience: string
  season_label: string | null
  description: string | null
  location: string | null
  starts_on: string | null
  ends_on: string | null
  meeting_days: string[]
  capacity: number | null
  registration_intro: string | null
  registration_modes: string[]
}

const typeLabel: Record<string, string> = {
  afterschool: 'Afterschool',
  summer: 'Summer',
  club: 'Club',
  class: 'Class',
  workshop: 'Workshop',
  special: 'Special Program',
  other: 'Program',
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PublicRegistrationDirectory() {
  const [programs, setPrograms] = useState<PublicProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    supabase.rpc('public_registration_catalog').then(({ data, error: loadError }) => {
      if (!mounted) return
      setPrograms((data ?? []) as PublicProgram[])
      setError(loadError?.message ?? '')
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  return (
    <main className={styles.portalShell}>
      <header className={styles.publicHeader}>
        <div className={styles.brandMark}>JH</div>
        <div><strong>Juanita Hub</strong><span>Juanita Sanders Community Learning Center</span></div>
      </header>

      <section className={styles.directoryHero}>
        <span className={styles.eyebrow}>Program Registration</span>
        <h1>Register for a program</h1>
        <p>Choose a program below to start. Returning families should use the private renewal link provided by the center when one is available.</p>
      </section>

      {loading && <div className={styles.stateCard}>Loading available programs…</div>}
      {error && <div className={styles.errorCard}>{error}</div>}

      {!loading && !error && (
        <section className={styles.programGrid}>
          {programs.map((program) => {
            const starts = formatDate(program.starts_on)
            const ends = formatDate(program.ends_on)
            return (
              <article className={styles.programCard} key={program.public_id}>
                <div className={styles.programCardTop}>
                  <span className={styles.programType}>{typeLabel[program.program_type] ?? 'Program'}</span>
                  {program.season_label && <span className={styles.season}>{program.season_label}</span>}
                </div>
                <h2>{program.name}</h2>
                {program.description && <p>{program.description}</p>}
                <dl className={styles.programMeta}>
                  {(starts || ends) && <div><dt>Dates</dt><dd>{starts ?? 'TBD'}{ends ? ` – ${ends}` : ''}</dd></div>}
                  {program.location && <div><dt>Location</dt><dd>{program.location}</dd></div>}
                  {program.meeting_days?.length > 0 && <div><dt>Days</dt><dd>{program.meeting_days.join(', ')}</dd></div>}
                </dl>
                <Link className={styles.primaryLink} href={`/register/${program.public_id}`}>Start registration</Link>
              </article>
            )
          })}
          {programs.length === 0 && <div className={styles.stateCard}><strong>No registrations are open right now.</strong><span>Please check back later or contact the center.</span></div>}
        </section>
      )}

      <footer className={styles.publicFooter}>Juanita Sanders Community Learning Center • Registration powered by Juanita Hub</footer>
    </main>
  )
}
