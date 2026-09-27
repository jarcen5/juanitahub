'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TypingConfig = {
  passage?: string
  target_wpm?: number
  target_accuracy?: number
}

type Props = {
  studentAssignmentId: number
  childId: number
  assignmentId: number
  assignmentTitle: string
  studentName: string
  activityConfig: TypingConfig | null
  userId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

function statsFor(passage: string, typed: string, seconds: number) {
  const typedCharacters = typed.length
  let correctCharacters = 0
  for (let index = 0; index < typed.length; index += 1) {
    if (typed[index] === passage[index]) correctCharacters += 1
  }
  const accuracy = typedCharacters ? (correctCharacters / typedCharacters) * 100 : 100
  const minutes = Math.max(seconds, 1) / 60
  const wpm = (correctCharacters / 5) / minutes
  return {
    typedCharacters,
    correctCharacters,
    accuracy: Math.max(0, Math.min(100, accuracy)),
    wpm: Math.max(0, wpm),
  }
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

export default function TypingActivityRunner({
  studentAssignmentId,
  childId,
  assignmentId,
  assignmentTitle,
  studentName,
  activityConfig,
  userId,
  onClose,
  onSaved,
}: Props) {
  const passage = activityConfig?.passage?.trim() ?? ''
  const targetWpm = typeof activityConfig?.target_wpm === 'number' ? activityConfig.target_wpm : null
  const targetAccuracy = typeof activityConfig?.target_accuracy === 'number' ? activityConfig.target_accuracy : null

  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (startedAt == null || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [startedAt, finished])

  useEffect(() => {
    if (!finished) textareaRef.current?.focus()
  }, [finished])

  const stats = useMemo(() => statsFor(passage, typed, elapsedSeconds), [passage, typed, elapsedSeconds])
  const complete = passage.length > 0 && typed.length === passage.length
  const progress = passage.length ? Math.min(100, Math.round((typed.length / passage.length) * 100)) : 0

  function handleTyping(value: string) {
    if (finished || !passage) return
    if (startedAt == null && value.length > 0) setStartedAt(Date.now())
    setTyped(value.slice(0, passage.length))
  }

  function resetAttempt() {
    setTyped('')
    setStartedAt(null)
    setElapsedSeconds(0)
    setFinished(false)
    setSaveWarning('')
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function finishAttempt() {
    if (!complete || saving || startedAt == null) return

    const finalSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const finalStats = statsFor(passage, typed, finalSeconds)
    const roundedAccuracy = Math.round(finalStats.accuracy * 100) / 100
    const roundedWpm = Math.round(finalStats.wpm * 100) / 100
    const completionNote = 'Typing: ' + roundedWpm.toFixed(1) + ' WPM • ' + roundedAccuracy.toFixed(1) + '% accuracy'

    setSaving(true)
    setSaveWarning('')

    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        score: roundedAccuracy,
        max_score: 100,
        minutes_spent: Math.max(1, Math.ceil(finalSeconds / 60)),
        staff_note: completionNote,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentAssignmentId)

    if (assignmentError) {
      setSaving(false)
      setSaveWarning(assignmentError.message)
      return
    }

    const { error: attemptError } = await supabase.from('learning_typing_attempts').insert({
      student_assignment_id: studentAssignmentId,
      child_id: childId,
      assignment_id: assignmentId,
      passage_text: passage,
      typed_characters: finalStats.typedCharacters,
      correct_characters: finalStats.correctCharacters,
      wpm: roundedWpm,
      accuracy: roundedAccuracy,
      duration_seconds: finalSeconds,
      completed_by: userId,
    })

    setElapsedSeconds(finalSeconds)
    setFinished(true)
    setSaving(false)
    if (attemptError) setSaveWarning('The assignment was completed, but the typing-attempt history could not be saved: ' + attemptError.message)
    await onSaved()
  }

  const targetWpmMet = targetWpm == null || stats.wpm >= targetWpm
  const targetAccuracyMet = targetAccuracy == null || stats.accuracy >= targetAccuracy

  return (
    <div className="typing-runner-backdrop">
      <main className="typing-runner-shell">
        <header className="typing-runner-topbar">
          <div>
            <span className="learning-kicker">Juanita Hub Typing Lab</span>
            <strong>{studentName}</strong>
          </div>
          <button className="ghost" type="button" disabled={saving} onClick={onClose}>Exit activity</button>
        </header>

        {!passage ? (
          <section className="typing-runner-empty">
            <span>⌨️</span>
            <h1>This typing activity needs a passage.</h1>
            <p>Edit <strong>{assignmentTitle}</strong> in Assignment Library and add the typing passage before launching it.</p>
            <button className="primary" type="button" onClick={onClose}>Back to Learning Hub</button>
          </section>
        ) : finished ? (
          <section className="typing-results">
            <span className="typing-results-icon">🎉</span>
            <span className="learning-kicker">Activity complete</span>
            <h1>{assignmentTitle}</h1>
            <p>{studentName}’s result was saved automatically to this week’s assignment.</p>

            <div className="typing-results-grid">
              <article><strong>{stats.wpm.toFixed(1)}</strong><span>WPM</span>{targetWpm != null && <small className={targetWpmMet ? 'met' : ''}>Goal {targetWpm}</small>}</article>
              <article><strong>{stats.accuracy.toFixed(1)}%</strong><span>Accuracy</span>{targetAccuracy != null && <small className={targetAccuracyMet ? 'met' : ''}>Goal {targetAccuracy}%</small>}</article>
              <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Time</span><small>{stats.correctCharacters}/{stats.typedCharacters} correct characters</small></article>
            </div>

            {saveWarning && <div className="notice">{saveWarning}</div>}

            <div className="typing-results-actions">
              <button className="ghost" type="button" onClick={resetAttempt}>Try again</button>
              <button className="primary" type="button" onClick={onClose}>Done</button>
            </div>
          </section>
        ) : (
          <section className="typing-workspace">
            <div className="typing-activity-heading">
              <div>
                <span className="learning-kicker">Typing activity</span>
                <h1>{assignmentTitle}</h1>
                <p>Type the passage below. The timer begins with the first character.</p>
              </div>
              <div className="typing-live-stats">
                <article><strong>{startedAt == null ? '—' : stats.wpm.toFixed(1)}</strong><span>WPM</span></article>
                <article><strong>{startedAt == null ? '—' : stats.accuracy.toFixed(1) + '%'}</strong><span>Accuracy</span></article>
                <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Time</span></article>
              </div>
            </div>

            {(targetWpm != null || targetAccuracy != null) && (
              <div className="typing-goals">
                <strong>Goals</strong>
                {targetWpm != null && <span className={startedAt != null && targetWpmMet ? 'met' : ''}>⌨️ {targetWpm} WPM</span>}
                {targetAccuracy != null && <span className={startedAt != null && targetAccuracyMet ? 'met' : ''}>🎯 {targetAccuracy}% accuracy</span>}
              </div>
            )}

            <div className="typing-progress-line"><span style={{ width: progress + '%' }} /></div>

            <div className="typing-passage" aria-label="Typing passage">
              {Array.from(passage).map((character, index) => {
                let state = 'pending'
                if (index < typed.length) state = typed[index] === character ? 'correct' : 'incorrect'
                else if (index === typed.length) state = 'current'
                return <span className={state} key={index}>{character === ' ' ? '\u00a0' : character}</span>
              })}
            </div>

            <label className="typing-input-wrap">
              <span>Type here</span>
              <textarea
                ref={textareaRef}
                value={typed}
                maxLength={passage.length}
                rows={5}
                onChange={(event) => handleTyping(event.target.value)}
                onPaste={(event) => event.preventDefault()}
                onDrop={(event) => event.preventDefault()}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Start typing the passage…"
              />
            </label>

            <div className="typing-bottom-bar">
              <span><strong>{typed.length}</strong> / {passage.length} characters • {progress}% complete</span>
              <div>
                <button className="ghost" type="button" disabled={saving || typed.length === 0} onClick={resetAttempt}>Reset</button>
                <button className="primary" type="button" disabled={saving || !complete || startedAt == null} onClick={() => void finishAttempt()}>{saving ? 'Saving…' : complete ? 'Finish & save result' : 'Finish passage first'}</button>
              </div>
            </div>

            {saveWarning && <div className="notice">{saveWarning}</div>}
          </section>
        )}
      </main>
    </div>
  )
}
