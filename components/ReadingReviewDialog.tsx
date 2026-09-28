'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ReadingAnswer, ReadingConfig, ReadingQuestion } from '@/components/ReadingActivityRunner'

export type ReadingAttempt = {
  id: number
  student_assignment_id: number
  child_id: number
  assignment_id: number
  answers: ReadingAnswer[]
  objective_correct: number
  objective_count: number
  written_count: number
  review_scores: Record<string, number>
  review_status: 'not_needed' | 'pending' | 'reviewed'
  staff_feedback: string | null
  reading_seconds: number
  duration_seconds: number
  submitted_at: string
  reviewed_at: string | null
  created_at: string
}

type Props = {
  attempt: ReadingAttempt | null
  assignmentTitle: string
  studentName: string
  activityConfig: ReadingConfig | null
  userId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

export default function ReadingReviewDialog({
  attempt,
  assignmentTitle,
  studentName,
  activityConfig,
  userId,
  onClose,
  onSaved,
}: Props) {
  const questions = activityConfig?.questions ?? []
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions])
  const writtenQuestions = useMemo(() => questions.filter((question) => question.type === 'short_answer'), [questions])

  const [scores, setScores] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!attempt) return
    setScores(attempt.review_scores ?? {})
    setFeedback(attempt.staff_feedback ?? '')
    setError('')
  }, [attempt])

  if (!attempt) return null
  const activeAttempt = attempt

  const allReviewed = writtenQuestions.every((question) => scores[question.id] === 0 || scores[question.id] === 1)
  const writtenEarned = writtenQuestions.reduce((sum, question) => sum + (scores[question.id] ?? 0), 0)
  const finalEarned = activeAttempt.objective_correct + writtenEarned
  const finalMax = activeAttempt.objective_count + writtenQuestions.length
  const finalPercent = finalMax ? Math.round((finalEarned / finalMax) * 1000) / 10 : 0

  async function saveReview() {
    if (saving) return
    if (!allReviewed) {
      setError('Review every written response before saving.')
      return
    }

    setSaving(true)
    setError('')
    const now = new Date().toISOString()

    const { error: reviewError } = await supabase
      .from('learning_reading_attempts')
      .update({
        review_scores: scores,
        review_status: 'reviewed',
        staff_feedback: feedback.trim() || null,
        reviewed_by: userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', activeAttempt.id)

    if (reviewError) {
      setSaving(false)
      setError(reviewError.message)
      return
    }

    const note = 'Reading comprehension: ' + finalEarned + '/' + finalMax + ' • ' + finalPercent.toFixed(1) + '% • written responses reviewed'
    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        score: finalEarned,
        max_score: finalMax,
        staff_note: note,
        updated_by: userId,
        updated_at: now,
      })
      .eq('id', activeAttempt.student_assignment_id)

    setSaving(false)

    if (assignmentError) {
      setError('Review was saved, but the assignment score could not be updated: ' + assignmentError.message)
      return
    }

    await onSaved()
    onClose()
  }

  function answerFor(questionId: string) {
    return activeAttempt.answers.find((answer) => answer.question_id === questionId)
  }

  return (
    <div className="reading-review-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <section className="reading-review-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-review-title" onClick={(event) => event.stopPropagation()}>
        <header className="reading-review-header">
          <div>
            <span className="learning-kicker">Reading response review</span>
            <h2 id="reading-review-title">{assignmentTitle}</h2>
            <p>{studentName} • {activeAttempt.objective_correct}/{activeAttempt.objective_count} objective correct • {writtenQuestions.length} written response{writtenQuestions.length === 1 ? '' : 's'}</p>
          </div>
          <button className="ghost" type="button" disabled={saving} onClick={onClose}>Close</button>
        </header>

        {error && <div className="notice">{error}</div>}

        <div className="reading-review-layout">
          <section className="reading-review-main">
            {writtenQuestions.map((question, index) => {
              const answer = answerFor(question.id)
              return (
                <article className="reading-review-response" key={question.id}>
                  <span className="learning-kicker">Written response {index + 1}</span>
                  <h3>{question.prompt}</h3>
                  <div className="reading-review-student-answer"><strong>Student response</strong><p>{answer?.response || 'No response.'}</p></div>
                  {question.correct_answer && <div className="reading-review-guidance"><strong>Staff guidance</strong><p>{question.correct_answer}</p></div>}
                  <div className="reading-review-score-row">
                    <span>Does this response show the expected understanding?</span>
                    <div>
                      <button className={scores[question.id] === 0 ? 'active no' : ''} type="button" onClick={() => setScores((current) => ({ ...current, [question.id]: 0 }))}>Needs work • 0</button>
                      <button className={scores[question.id] === 1 ? 'active yes' : ''} type="button" onClick={() => setScores((current) => ({ ...current, [question.id]: 1 }))}>Meets • 1</button>
                    </div>
                  </div>
                </article>
              )
            })}

            <label className="field reading-review-feedback"><span>Staff feedback <small>(optional)</small></span><textarea rows={5} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What did the student understand well? What should they reread or practice?" /></label>

            <div className="reading-review-actions">
              <button className="ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
              <button className="primary" type="button" disabled={saving || !allReviewed} onClick={() => void saveReview()}>{saving ? 'Saving review…' : 'Save review • ' + finalEarned + '/' + finalMax}</button>
            </div>
          </section>

          <aside className="reading-review-summary">
            <span className="learning-kicker">Score preview</span>
            <strong>{finalEarned}/{finalMax}</strong>
            <em>{finalPercent.toFixed(1)}%</em>
            <p>{allReviewed ? 'All written responses have been reviewed.' : 'Rate every written response to complete the final score.'}</p>

            <div>
              <span>Objective questions</span><strong>{activeAttempt.objective_correct}/{activeAttempt.objective_count}</strong>
            </div>
            <div>
              <span>Written responses</span><strong>{writtenEarned}/{writtenQuestions.length}</strong>
            </div>
            <div>
              <span>Activity time</span><strong>{Math.max(1, Math.ceil(activeAttempt.duration_seconds / 60))} min</strong>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
