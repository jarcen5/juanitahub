'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type WritingMode = 'journal' | 'short_response' | 'paragraph' | 'creative' | 'reading_response'

export type WritingConfig = {
  writing_mode?: WritingMode
  prompt?: string
  sentence_starters?: string[]
  min_words?: number
  target_words?: number
  rubric_criteria?: string[]
}

type Props = {
  studentAssignmentId?: number
  studentAssignmentStatus?: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  childId?: number
  assignmentId?: number
  assignmentTitle: string
  studentName?: string
  activityConfig: WritingConfig | null
  userId?: string
  testMode?: boolean
  onClose: () => void
  onSaved?: () => Promise<void> | void
}

const modeLabels: Record<WritingMode, string> = {
  journal: 'Journal Prompt',
  short_response: 'Short Response',
  paragraph: 'Paragraph Writing',
  creative: 'Creative Writing',
  reading_response: 'Reading Response',
}

function countWords(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

export default function WritingActivityRunner({
  studentAssignmentId,
  studentAssignmentStatus = 'assigned',
  childId,
  assignmentId,
  assignmentTitle,
  studentName,
  activityConfig,
  userId,
  testMode = false,
  onClose,
  onSaved,
}: Props) {
  const mode = activityConfig?.writing_mode ?? 'journal'
  const prompt = activityConfig?.prompt?.trim() ?? ''
  const starters = (activityConfig?.sentence_starters ?? []).map((item) => item.trim()).filter(Boolean)
  const rubricCriteria = (activityConfig?.rubric_criteria ?? []).map((item) => item.trim()).filter(Boolean)
  const minWords = Math.max(0, Math.round(Number(activityConfig?.min_words ?? 0)))
  const targetWords = Math.max(minWords, Math.round(Number(activityConfig?.target_words ?? minWords)))

  const [content, setContent] = useState('')
  const [submissionId, setSubmissionId] = useState<number | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<'draft' | 'submitted' | 'reviewed'>('draft')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [savedActiveSeconds, setSavedActiveSeconds] = useState(0)
  const [loadingDraft, setLoadingDraft] = useState(!testMode)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [message, setMessage] = useState('')

  const wordCount = useMemo(() => countWords(content), [content])
  const goalWords = targetWords || minWords
  const progress = goalWords ? Math.min(100, Math.round((wordCount / goalWords) * 100)) : 0
  const minimumMet = !minWords || wordCount >= minWords

  useEffect(() => {
    if (testMode || !studentAssignmentId) {
      setLoadingDraft(false)
      return
    }
    let mounted = true
    supabase
      .from('learning_writing_submissions')
      .select('id, content, status, active_seconds')
      .eq('student_assignment_id', studentAssignmentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) setMessage(error.message)
        if (data) {
          setSubmissionId(data.id as number)
          setContent((data.content as string) ?? '')
          const loadedStatus = data.status as 'draft' | 'submitted' | 'reviewed'
          setSubmissionStatus(loadedStatus)
          setSavedActiveSeconds(Number(data.active_seconds ?? 0))
          if (loadedStatus !== 'draft') setFinished(true)
        }
        setLoadingDraft(false)
      })
    return () => { mounted = false }
  }, [studentAssignmentId, testMode])

  useEffect(() => {
    if (startedAt == null || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [startedAt, finished])

  function changeContent(value: string) {
    if (startedAt == null && value.length > 0) setStartedAt(Date.now())
    setContent(value)
    if (message) setMessage('')
  }

  function useStarter(starter: string) {
    const next = content.trim() ? content + (content.endsWith(' ') ? '' : ' ') + starter + ' ' : starter + ' '
    changeContent(next)
  }

  async function persistWriting(status: 'draft' | 'submitted') {
    if (testMode) {
      setMessage(status === 'draft' ? 'Test draft saved locally. Nothing was written to Juanita Hub.' : '')
      if (status === 'submitted') {
        setFinished(true)
        setSubmissionStatus('submitted')
      }
      return
    }

    if (!studentAssignmentId || !childId || !assignmentId || !userId) {
      setMessage('This writing activity is missing the assignment information needed to save.')
      return
    }

    setSaving(true)
    setMessage('')
    const now = new Date().toISOString()
    const sessionSeconds = startedAt == null ? 0 : Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    const totalActiveSeconds = Math.min(864000, savedActiveSeconds + sessionSeconds)
    let currentSubmissionId = submissionId

    if (currentSubmissionId) {
      const { error } = await supabase
        .from('learning_writing_submissions')
        .update({
          content,
          word_count: wordCount,
          status,
          active_seconds: totalActiveSeconds,
          submitted_at: status === 'submitted' ? now : null,
          last_saved_at: now,
          updated_by: userId,
          updated_at: now,
        })
        .eq('id', currentSubmissionId)

      if (error) {
        setSaving(false)
        setMessage(error.message)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('learning_writing_submissions')
        .insert({
          student_assignment_id: studentAssignmentId,
          child_id: childId,
          assignment_id: assignmentId,
          content,
          word_count: wordCount,
          status,
          started_at: startedAt == null ? now : new Date(startedAt).toISOString(),
          active_seconds: totalActiveSeconds,
          submitted_at: status === 'submitted' ? now : null,
          updated_by: userId,
        })
        .select('id')
        .single()

      if (error || !data) {
        setSaving(false)
        setMessage(error?.message ?? 'Could not save the writing draft.')
        return
      }
      currentSubmissionId = data.id as number
      setSubmissionId(currentSubmissionId)
    }

    const { error: revisionError } = await supabase.from('learning_writing_revisions').insert({
      writing_submission_id: currentSubmissionId,
      content,
      word_count: wordCount,
      saved_by: userId,
    })

    if (revisionError) setMessage('Writing saved, but the revision snapshot could not be recorded: ' + revisionError.message)

    if (status === 'draft') {
      if (studentAssignmentStatus === 'assigned') {
        await supabase
          .from('learning_student_assignments')
          .update({ status: 'in_progress', updated_by: userId, updated_at: now })
          .eq('id', studentAssignmentId)
      }
      setSavedActiveSeconds(totalActiveSeconds)
      setStartedAt(Date.now())
      setElapsedSeconds(0)
      setSubmissionStatus('draft')
      setSaving(false)
      if (!revisionError) setMessage('Draft saved.')
      if (onSaved) await onSaved()
      return
    }

    const seconds = Math.max(1, totalActiveSeconds)
    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        completed_at: now,
        score: null,
        max_score: null,
        minutes_spent: Math.max(1, Math.ceil(seconds / 60)),
        staff_note: 'Writing submitted • ' + wordCount + ' words',
        updated_by: userId,
        updated_at: now,
      })
      .eq('id', studentAssignmentId)

    setSaving(false)
    if (assignmentError) {
      setMessage('Writing was submitted, but the assignment status could not be updated: ' + assignmentError.message)
      return
    }

    setSavedActiveSeconds(totalActiveSeconds)
    setElapsedSeconds(0)
    setStartedAt(null)
    setSubmissionStatus('submitted')
    setFinished(true)
    if (!revisionError) setMessage('')
    if (onSaved) await onSaved()
  }

  function resetTest() {
    if (!testMode) return
    setContent('')
    setSubmissionStatus('draft')
    setStartedAt(null)
    setElapsedSeconds(0)
    setSavedActiveSeconds(0)
    setFinished(false)
    setMessage('')
  }

  if (!prompt) {
    return (
      <div className="writing-runner-backdrop">
        <main className={'writing-runner-shell' + (testMode ? ' test-mode' : '')}>
          {testMode && <div className="writing-test-banner"><strong>TEST MODE</strong><span>No drafts, submissions, or progress will be saved.</span></div>}
          <header className="writing-runner-topbar"><div><span className="learning-kicker">Juanita Hub Writing Lab</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div><button className="ghost" type="button" onClick={onClose}>Exit</button></header>
          <section className="writing-runner-empty"><span>✍️</span><h1>This writing activity needs a prompt.</h1><p>Edit <strong>{assignmentTitle}</strong> in Assignment Library and add the writing prompt before launching it.</p><button className="primary" type="button" onClick={onClose}>Back to Learning Hub</button></section>
        </main>
      </div>
    )
  }

  return (
    <div className="writing-runner-backdrop">
      <main className={'writing-runner-shell' + (testMode ? ' test-mode' : '')}>
        {testMode && <div className="writing-test-banner"><strong>TEST MODE</strong><span>Use Writing Lab exactly like a student. Nothing is assigned, submitted, or saved.</span></div>}

        <header className="writing-runner-topbar">
          <div><span className="learning-kicker">Juanita Hub Writing Lab • {modeLabels[mode]}</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div>
          <div className="writing-runner-top-actions"><span>{timeLabel(elapsedSeconds)}</span><button className="ghost" type="button" disabled={saving} onClick={onClose}>{testMode ? 'Exit test' : 'Exit writing'}</button></div>
        </header>

        {loadingDraft ? (
          <section className="writing-runner-empty"><span>✍️</span><h1>Loading draft…</h1></section>
        ) : finished ? (
          <section className="writing-results">
            <span className="writing-results-icon">✓</span>
            <span className="learning-kicker">{testMode ? 'Test submission complete' : submissionStatus === 'reviewed' ? 'Writing reviewed' : 'Writing submitted'}</span>
            <h1>{assignmentTitle}</h1>
            <p>{testMode ? 'Nothing was saved. This is the same submission experience a child will see.' : submissionStatus === 'reviewed' ? 'Staff review is complete. Your submitted writing is locked so the reviewed version stays unchanged.' : 'Your writing has been sent to staff for review and is locked while it is waiting for feedback.'}</p>

            <div className="writing-results-grid">
              <article><strong>{wordCount}</strong><span>Words</span><small>{goalWords ? 'Goal ' + goalWords : 'No word goal'}</small></article>
              <article><strong>{timeLabel(savedActiveSeconds + elapsedSeconds)}</strong><span>Writing time</span><small>{submissionStatus === 'submitted' ? 'Submitted' : submissionStatus}</small></article>
              <article><strong>{rubricCriteria.length || '—'}</strong><span>Review areas</span><small>{rubricCriteria.length ? 'Staff rubric' : 'Feedback only'}</small></article>
            </div>

            {message && <div className="notice">{message}</div>}
            <div className="writing-results-actions">
              {testMode && <button className="ghost" type="button" onClick={resetTest}>Test again</button>}
              <button className="primary" type="button" onClick={onClose}>Done</button>
            </div>
          </section>
        ) : (
          <section className="writing-workspace">
            <div className="writing-heading">
              <div><span className="learning-kicker">{modeLabels[mode]}</span><h1>{assignmentTitle}</h1></div>
              <div className="writing-live-stats"><article><strong>{wordCount}</strong><span>Words</span></article><article><strong>{goalWords || '—'}</strong><span>Goal</span></article><article><strong>{timeLabel(savedActiveSeconds + elapsedSeconds)}</strong><span>Time</span></article></div>
            </div>

            {goalWords > 0 && <div className="writing-progress-line"><span style={{ width: progress + '%' }} /></div>}

            <section className="writing-prompt-card">
              <span className="learning-kicker">Your prompt</span>
              <h2>{prompt}</h2>
              {minWords > 0 && <small>Write at least {minWords} words.{targetWords > minWords ? ' Aim for about ' + targetWords + ' words.' : ''}</small>}
            </section>

            {starters.length > 0 && (
              <section className="writing-starters">
                <strong>Need help getting started?</strong>
                <div>{starters.map((starter) => <button className="ghost" type="button" key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}</div>
              </section>
            )}

            {rubricCriteria.length > 0 && <div className="writing-expectations"><strong>Staff will look for:</strong>{rubricCriteria.map((criterion) => <span key={criterion}>✓ {criterion}</span>)}</div>}

            <label className="writing-editor">
              <span>Your writing</span>
              <textarea value={content} onChange={(event) => changeContent(event.target.value)} rows={15} placeholder="Start writing here…" spellCheck />
            </label>

            <div className="writing-bottom-bar">
              <span>{minimumMet ? 'Ready to submit when you are finished.' : (minWords - wordCount) + ' more word' + (minWords - wordCount === 1 ? '' : 's') + ' to reach the minimum.'}</span>
              <div>
                <button className="ghost" type="button" disabled={saving || !content.trim()} onClick={() => void persistWriting('draft')}>{saving ? 'Saving…' : 'Save draft'}</button>
                <button className="primary" type="button" disabled={saving || !content.trim() || !minimumMet} onClick={() => void persistWriting('submitted')}>{saving ? 'Submitting…' : 'Submit writing'}</button>
              </div>
            </div>

            {message && <div className="notice">{message}</div>}
          </section>
        )}
      </main>
    </div>
  )
}
