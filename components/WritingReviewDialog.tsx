'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { WritingConfig } from '@/components/WritingActivityRunner'

export type WritingSubmission = {
  id: number
  student_assignment_id: number
  child_id: number
  assignment_id: number
  content: string
  word_count: number
  status: 'draft' | 'submitted' | 'reviewed'
  started_at: string | null
  submitted_at: string | null
  last_saved_at: string
  staff_feedback: string | null
  rubric_scores: Record<string, number>
  reviewed_at: string | null
  updated_at: string
}

type Revision = {
  id: number
  content: string
  word_count: number
  created_at: string
}

type Props = {
  submission: WritingSubmission | null
  assignmentTitle: string
  studentName: string
  activityConfig: WritingConfig | null
  userId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

export default function WritingReviewDialog({
  submission,
  assignmentTitle,
  studentName,
  activityConfig,
  userId,
  onClose,
  onSaved,
}: Props) {
  const criteria = useMemo(() => (activityConfig?.rubric_criteria ?? []).map((item) => item.trim()).filter(Boolean), [activityConfig])
  const [feedback, setFeedback] = useState('')
  const [scores, setScores] = useState<Record<string, number>>({})
  const [recordScore, setRecordScore] = useState(false)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!submission) return
    setFeedback(submission.staff_feedback ?? '')
    setScores(submission.rubric_scores ?? {})
    setRecordScore(false)
    setSelectedRevision(null)
    setError('')
    setLoading(true)
    supabase
      .from('learning_writing_revisions')
      .select('id, content, word_count, created_at')
      .eq('writing_submission_id', submission.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: revisionError }) => {
        setRevisions((data ?? []) as Revision[])
        if (revisionError) setError(revisionError.message)
        setLoading(false)
      })
  }, [submission])

  if (!submission) return null

  const filledScores = criteria.map((criterion) => scores[criterion]).filter((value): value is number => Number.isFinite(value))
  const scoreTotal = filledScores.reduce((sum, value) => sum + value, 0)
  const scoreMax = criteria.length * 4
  const allRubricFilled = criteria.length > 0 && filledScores.length === criteria.length

  async function saveReview() {
    if (saving) return
    if (recordScore && !allRubricFilled) {
      setError('Rate every rubric area before recording a rubric score.')
      return
    }

    setSaving(true)
    setError('')
    const now = new Date().toISOString()

    const { error: submissionError } = await supabase
      .from('learning_writing_submissions')
      .update({
        status: 'reviewed',
        staff_feedback: feedback.trim() || null,
        rubric_scores: scores,
        reviewed_by: userId,
        reviewed_at: now,
        updated_by: userId,
        updated_at: now,
      })
      .eq('id', submission.id)

    if (submissionError) {
      setSaving(false)
      setError(submissionError.message)
      return
    }

    const assignmentUpdate: Record<string, unknown> = {
      status: 'completed',
      staff_note: 'Writing reviewed • ' + submission.word_count + ' words' + (feedback.trim() ? ' • feedback added' : ''),
      updated_by: userId,
      updated_at: now,
    }

    if (recordScore && allRubricFilled) {
      assignmentUpdate.score = scoreTotal
      assignmentUpdate.max_score = scoreMax
    }

    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update(assignmentUpdate)
      .eq('id', submission.student_assignment_id)

    setSaving(false)
    if (assignmentError) {
      setError('Review saved, but the assignment summary could not be updated: ' + assignmentError.message)
      return
    }

    await onSaved()
    onClose()
  }

  return (
    <div className="writing-review-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <section className="writing-review-dialog" role="dialog" aria-modal="true" aria-labelledby="writing-review-title" onClick={(event) => event.stopPropagation()}>
        <header className="writing-review-header">
          <div>
            <span className="learning-kicker">Writing review</span>
            <h2 id="writing-review-title">{assignmentTitle}</h2>
            <p>{studentName} • {submission.word_count} words • {submission.status}</p>
          </div>
          <button className="ghost" type="button" disabled={saving} onClick={onClose}>Close</button>
        </header>

        {error && <div className="notice">{error}</div>}

        <div className="writing-review-layout">
          <section className="writing-review-main">
            <article className="writing-review-response">
              <span className="learning-kicker">Student response</span>
              <p>{submission.content || 'No writing submitted.'}</p>
            </article>

            {criteria.length > 0 && (
              <section className="writing-rubric">
                <div><span className="learning-kicker">Simple rubric</span><h3>Rate each area from 1–4</h3></div>
                {criteria.map((criterion) => (
                  <article key={criterion}>
                    <strong>{criterion}</strong>
                    <div>
                      {[1,2,3,4].map((value) => <button className={scores[criterion] === value ? 'active' : ''} type="button" key={value} onClick={() => setScores((current) => ({ ...current, [criterion]: value }))}>{value}</button>)}
                    </div>
                  </article>
                ))}
                <small>1 = needs support • 2 = developing • 3 = solid • 4 = strong</small>
                <label className="learning-check-row"><input type="checkbox" checked={recordScore} onChange={(event) => setRecordScore(event.target.checked)} /><span>Also record rubric total as assignment score {allRubricFilled ? '(' + scoreTotal + '/' + scoreMax + ')' : ''}</span></label>
              </section>
            )}

            <label className="field writing-feedback-field">
              <span>Staff feedback</span>
              <textarea rows={6} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What did the student do well? What should they try next?" />
            </label>

            <div className="writing-review-actions">
              <button className="ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
              <button className="primary" type="button" disabled={saving} onClick={() => void saveReview()}>{saving ? 'Saving review…' : 'Save review'}</button>
            </div>
          </section>

          <aside className="writing-revision-panel">
            <span className="learning-kicker">Revision history</span>
            <h3>{revisions.length} saved version{revisions.length === 1 ? '' : 's'}</h3>
            {loading ? <p className="subtle">Loading revisions…</p> : (
              <div className="writing-revision-list">
                {revisions.map((revision, index) => (
                  <button className={selectedRevision?.id === revision.id ? 'active' : ''} type="button" key={revision.id} onClick={() => setSelectedRevision((current) => current?.id === revision.id ? null : revision)}>
                    <span><strong>{index === 0 ? 'Latest save' : 'Revision ' + (revisions.length - index)}</strong><small>{new Date(revision.created_at).toLocaleString()}</small></span>
                    <em>{revision.word_count} words</em>
                  </button>
                ))}
                {revisions.length === 0 && <p className="subtle">No revision snapshots yet.</p>}
              </div>
            )}
            {selectedRevision && <article className="writing-revision-preview"><strong>Saved version</strong><p>{selectedRevision.content}</p></article>}
          </aside>
        </div>
      </section>
    </div>
  )
}
