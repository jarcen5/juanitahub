'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type CompletionAssignment = {
  id: number
  score: number | null
  max_score: number | null
  minutes_spent: number | null
  staff_note: string | null
}

type Props = {
  row: CompletionAssignment | null
  assignmentTitle: string
  studentName: string
  userId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

export default function AssignmentCompletionDialog({
  row,
  assignmentTitle,
  studentName,
  userId,
  onClose,
  onSaved,
}: Props) {
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!row) return
    setScore(row.score == null ? '' : String(row.score))
    setMaxScore(row.max_score == null ? '' : String(row.max_score))
    setMinutes(row.minutes_spent == null ? '' : String(row.minutes_spent))
    setNote(row.staff_note ?? '')
    setError('')
  }, [row])

  if (!row) return null

  async function saveCompletion() {
    if (saving) return

    const parsedScore = score.trim() === '' ? null : Number(score)
    const parsedMax = maxScore.trim() === '' ? null : Number(maxScore)
    const parsedMinutes = minutes.trim() === '' ? null : Number(minutes)

    if (parsedScore != null && (!Number.isFinite(parsedScore) || parsedScore < 0)) {
      setError('Score must be 0 or higher.')
      return
    }
    if (parsedMax != null && (!Number.isFinite(parsedMax) || parsedMax <= 0)) {
      setError('Max score must be greater than 0.')
      return
    }
    if ((parsedScore == null) !== (parsedMax == null)) {
      setError('Enter both score and max score, or leave both blank.')
      return
    }
    if (parsedScore != null && parsedMax != null && parsedScore > parsedMax) {
      setError('Score cannot be higher than the max score.')
      return
    }
    if (parsedMinutes != null && (!Number.isInteger(parsedMinutes) || parsedMinutes < 0 || parsedMinutes > 1440)) {
      setError('Minutes must be a whole number between 0 and 1,440.')
      return
    }

    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        score: parsedScore,
        max_score: parsedMax,
        minutes_spent: parsedMinutes,
        staff_note: note.trim() || null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    await onSaved()
    onClose()
  }

  return (
    <div className="learning-completion-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <section className="card learning-completion-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-completion-title" onClick={(event) => event.stopPropagation()}>
        <button className="learning-completion-close" type="button" disabled={saving} onClick={onClose} aria-label="Close completion form">×</button>
        <span className="learning-kicker">Complete assignment</span>
        <h2 id="learning-completion-title">{assignmentTitle}</h2>
        <p className="subtle">Record what’s useful for {studentName}. Score, time, and notes are optional.</p>

        {error && <div className="notice">{error}</div>}

        <div className="learning-completion-grid">
          <label className="field">
            <span>Score <small>(optional)</small></span>
            <input type="number" min="0" step="0.01" value={score} onChange={(event) => setScore(event.target.value)} placeholder="8" />
          </label>
          <label className="field">
            <span>Out of <small>(optional)</small></span>
            <input type="number" min="0.01" step="0.01" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} placeholder="10" />
          </label>
          <label className="field">
            <span>Minutes spent <small>(optional)</small></span>
            <input type="number" min="0" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="20" />
          </label>
          <label className="field learning-completion-note">
            <span>Completion note <small>(optional)</small></span>
            <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Example: Finished independently after one reminder." />
          </label>
        </div>

        <div className="learning-completion-actions">
          <button className="ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="primary" type="button" disabled={saving} onClick={() => void saveCompletion()}>{saving ? 'Saving…' : 'Mark complete'}</button>
        </div>
      </section>
    </div>
  )
}
