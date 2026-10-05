'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'

type TypingMode = 'passage' | 'letter_drill' | 'guided_keys' | 'hand_placement'

type TypingConfig = {
  mode?: TypingMode
  passage?: string
  focus_keys?: string[]
  target_keystrokes?: number
  target_wpm?: number
  target_accuracy?: number
}

type Props = {
  studentAssignmentId?: number
  childId?: number
  assignmentId?: number
  assignmentTitle: string
  studentName?: string
  activityConfig: TypingConfig | null
  userId?: string
  studentAccess?: StudentAccessContext
  testMode?: boolean
  onClose: () => void
  onSaved?: () => Promise<void> | void
}

const keyboardRows = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l',';'],
  ['z','x','c','v','b','n','m',',','.','/'],
]

const fingerByKey: Record<string,string> = {
  q:'Left pinky', a:'Left pinky', z:'Left pinky',
  w:'Left ring', s:'Left ring', x:'Left ring',
  e:'Left middle', d:'Left middle', c:'Left middle',
  r:'Left index', f:'Left index', v:'Left index', t:'Left index', g:'Left index', b:'Left index',
  y:'Right index', h:'Right index', n:'Right index', u:'Right index', j:'Right index', m:'Right index',
  i:'Right middle', k:'Right middle', ',':'Right middle',
  o:'Right ring', l:'Right ring', '.':'Right ring',
  p:'Right pinky', ';':'Right pinky', '/':'Right pinky',
  ' ':'Thumb',
}

const modeLabels: Record<TypingMode,string> = {
  passage: 'Passage Practice',
  letter_drill: 'Letter Practice',
  guided_keys: 'Guided Keys',
  hand_placement: 'Hand Placement',
}

function normalizeKeys(keys?: string[]) {
  const cleaned = (keys ?? [])
    .map((key) => key === 'space' ? ' ' : key.trim().toLowerCase())
    .filter((key) => key.length === 1)
  return [...new Set(cleaned)]
}

function makeSequence(keys: string[], count: number) {
  if (!keys.length || count <= 0) return ''
  return Array.from({ length: count }, (_, index) => keys[index % keys.length]).join('')
}

function makeMixedSequence(keys: string[], count: number) {
  if (!keys.length || count <= 0) return ''
  let seed = count * 2654435761
  for (const key of keys) {
    seed = (seed ^ key.charCodeAt(0)) >>> 0
    seed = Math.imul(seed || 1, 1664525) >>> 0
  }
  return Array.from({ length: count }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return keys[seed % keys.length]
  }).join('')
}

function textStats(target: string, typed: string, seconds: number) {
  const typedCharacters = typed.length
  let correctCharacters = 0
  const mistakes: Record<string,number> = {}
  for (let index = 0; index < typed.length; index += 1) {
    if (typed[index] === target[index]) {
      correctCharacters += 1
    } else {
      const expected = target[index] ?? '?'
      mistakes[expected] = (mistakes[expected] ?? 0) + 1
    }
  }
  const accuracy = typedCharacters ? (correctCharacters / typedCharacters) * 100 : 100
  const minutes = Math.max(seconds, 1) / 60
  const wpm = (correctCharacters / 5) / minutes
  return {
    typedCharacters,
    correctCharacters,
    accuracy: Math.max(0, Math.min(100, accuracy)),
    wpm: Math.max(0, wpm),
    mistakes,
  }
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

function mistakeTotal(mistakes: Record<string,number>) {
  return Object.values(mistakes).reduce((sum, value) => sum + value, 0)
}

export default function TypingActivityRunner({
  studentAssignmentId,
  childId,
  assignmentId,
  assignmentTitle,
  studentName,
  activityConfig,
  userId,
  studentAccess,
  testMode = false,
  onClose,
  onSaved,
}: Props) {
  const mode: TypingMode = activityConfig?.mode ?? 'passage'
  const focusKeys = useMemo(() => normalizeKeys(activityConfig?.focus_keys), [activityConfig?.focus_keys])
  const targetKeystrokes = Math.max(5, Math.min(500, Math.round(activityConfig?.target_keystrokes ?? 30)))
  const passage = activityConfig?.passage?.trim() ?? ''
  const targetText = useMemo(() => {
    if (mode === 'passage') return passage
    if (mode === 'letter_drill') return makeMixedSequence(focusKeys, targetKeystrokes)
    return makeSequence(focusKeys, targetKeystrokes)
  }, [mode, passage, focusKeys, targetKeystrokes])
  const targetWpm = typeof activityConfig?.target_wpm === 'number' ? activityConfig.target_wpm : null
  const targetAccuracy = typeof activityConfig?.target_accuracy === 'number' ? activityConfig.target_accuracy : null
  const guidedMode = mode === 'guided_keys' || mode === 'hand_placement'

  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const [guidedIndex, setGuidedIndex] = useState(0)
  const [guidedAttempts, setGuidedAttempts] = useState(0)
  const [guidedMistakes, setGuidedMistakes] = useState<Record<string,number>>({})
  const [lastKeyState, setLastKeyState] = useState<'correct' | 'incorrect' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const guidedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (startedAt == null || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [startedAt, finished])

  useEffect(() => {
    if (finished) return
    if (guidedMode) guidedRef.current?.focus()
    else textareaRef.current?.focus()
  }, [finished, guidedMode])

  const textModeStats = useMemo(() => textStats(targetText, typed, elapsedSeconds), [targetText, typed, elapsedSeconds])
  const guidedCorrect = guidedIndex
  const guidedAccuracy = guidedAttempts ? (guidedCorrect / guidedAttempts) * 100 : 100
  const guidedWpm = (guidedCorrect / 5) / (Math.max(elapsedSeconds, 1) / 60)
  const liveStats = guidedMode
    ? {
        typedCharacters: guidedAttempts,
        correctCharacters: guidedCorrect,
        accuracy: guidedAccuracy,
        wpm: guidedWpm,
        mistakes: guidedMistakes,
      }
    : textModeStats

  const complete = guidedMode ? guidedIndex >= targetText.length && targetText.length > 0 : targetText.length > 0 && typed.length === targetText.length
  const completedUnits = guidedMode ? guidedIndex : typed.length
  const progress = targetText.length ? Math.min(100, Math.round((completedUnits / targetText.length) * 100)) : 0
  const expectedKey = guidedMode ? targetText[guidedIndex] ?? '' : ''
  const needsSetup = mode === 'passage' ? !passage : focusKeys.length === 0

  function handleTyping(value: string) {
    if (finished || !targetText) return
    if (startedAt == null && value.length > 0) setStartedAt(Date.now())
    setTyped(value.slice(0, targetText.length))
  }

  function handleGuidedKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (finished || complete || !expectedKey) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    let pressed = event.key
    if (pressed === 'Spacebar') pressed = ' '
    if (pressed === ' ') event.preventDefault()
    if (pressed.length !== 1) return

    const normalized = pressed.toLowerCase()
    if (startedAt == null) setStartedAt(Date.now())
    setGuidedAttempts((value) => value + 1)

    if (normalized === expectedKey) {
      setGuidedIndex((value) => value + 1)
      setLastKeyState('correct')
    } else {
      setGuidedMistakes((current) => ({ ...current, [expectedKey]: (current[expectedKey] ?? 0) + 1 }))
      setLastKeyState('incorrect')
    }

    window.setTimeout(() => setLastKeyState(null), 180)
  }

  function resetAttempt() {
    setTyped('')
    setStartedAt(null)
    setElapsedSeconds(0)
    setFinished(false)
    setSaveWarning('')
    setGuidedIndex(0)
    setGuidedAttempts(0)
    setGuidedMistakes({})
    setLastKeyState(null)
    window.setTimeout(() => guidedMode ? guidedRef.current?.focus() : textareaRef.current?.focus(), 0)
  }

  async function finishAttempt() {
    if (!complete || saving || startedAt == null) return

    const finalSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const finalStats = guidedMode
      ? {
          typedCharacters: guidedAttempts,
          correctCharacters: guidedIndex,
          accuracy: guidedAttempts ? (guidedIndex / guidedAttempts) * 100 : 100,
          wpm: (guidedIndex / 5) / (finalSeconds / 60),
          mistakes: guidedMistakes,
        }
      : textStats(targetText, typed, finalSeconds)

    const roundedAccuracy = Math.round(finalStats.accuracy * 100) / 100
    const roundedWpm = Math.round(finalStats.wpm * 100) / 100
    const errors = mistakeTotal(finalStats.mistakes)
    const keyLabel = focusKeys.length ? ' • Keys: ' + focusKeys.map((key) => key === ' ' ? 'Space' : key.toUpperCase()).join(', ') : ''

    let completionNote = 'Typing: ' + roundedWpm.toFixed(1) + ' WPM • ' + roundedAccuracy.toFixed(1) + '% accuracy'
    if (mode === 'guided_keys') completionNote = 'Guided Keys: ' + roundedAccuracy.toFixed(1) + '% accuracy • ' + finalStats.correctCharacters + ' correct keys • ' + errors + ' mistakes' + keyLabel
    if (mode === 'hand_placement') completionNote = 'Hand Placement: ' + roundedAccuracy.toFixed(1) + '% accuracy • ' + finalStats.correctCharacters + ' correct keys • ' + errors + ' mistakes' + keyLabel
    if (mode === 'letter_drill') completionNote = 'Letter Practice: ' + roundedWpm.toFixed(1) + ' WPM • ' + roundedAccuracy.toFixed(1) + '% accuracy' + keyLabel

    if (testMode) {
      setElapsedSeconds(finalSeconds)
      setFinished(true)
      setSaveWarning('')
      return
    }

    if (!studentAssignmentId || !childId || !assignmentId || (!userId && !studentAccess)) {
      setSaveWarning('This activity is missing the assignment information needed to save a result.')
      return
    }

    setSaving(true)
    setSaveWarning('')

    if (studentAccess) {
      try {
        await studentLearningRequest('save_typing', {
          device_token: studentAccess.deviceToken,
          student_token: studentAccess.studentToken,
          student_assignment_id: studentAssignmentId,
          result: {
            passage_text: targetText,
            typed_characters: finalStats.typedCharacters,
            correct_characters: finalStats.correctCharacters,
            wpm: roundedWpm,
            accuracy: roundedAccuracy,
            duration_seconds: finalSeconds,
            activity_mode: mode,
            focus_keys: focusKeys,
            mistake_counts: finalStats.mistakes,
            staff_note: completionNote,
          },
        })
        setElapsedSeconds(finalSeconds)
        setFinished(true)
        setSaving(false)
        if (onSaved) await onSaved()
      } catch (error) {
        setSaving(false)
        setSaveWarning(error instanceof Error ? error.message : 'Typing result could not be saved.')
      }
      return
    }

    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        score: roundedAccuracy,
        max_score: 100,
        minutes_spent: Math.max(1, Math.ceil(finalSeconds / 60)),
        staff_note: completionNote,
        updated_by: userId!,
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
      passage_text: targetText,
      typed_characters: finalStats.typedCharacters,
      correct_characters: finalStats.correctCharacters,
      wpm: roundedWpm,
      accuracy: roundedAccuracy,
      duration_seconds: finalSeconds,
      completed_by: userId!,
      activity_mode: mode,
      focus_keys: focusKeys,
      mistake_counts: finalStats.mistakes,
    })

    setElapsedSeconds(finalSeconds)
    setFinished(true)
    setSaving(false)
    if (attemptError) setSaveWarning('The assignment was completed, but the typing-attempt history could not be saved: ' + attemptError.message)
    if (onSaved) await onSaved()
  }

  const targetWpmMet = targetWpm == null || liveStats.wpm >= targetWpm
  const targetAccuracyMet = targetAccuracy == null || liveStats.accuracy >= targetAccuracy
  const showWpm = mode === 'passage' || mode === 'letter_drill'

  return (
    <div className="typing-runner-backdrop">
      <main className={'typing-runner-shell' + (testMode ? ' test-mode' : '')}>
        {testMode && <div className="typing-test-banner"><strong>TEST MODE</strong><span>Use the activity exactly like a student. No assignments, scores, attempts, or progress will be saved.</span></div>}
        <header className="typing-runner-topbar">
          <div>
            <span className="learning-kicker">Juanita Hub Typing Lab • {modeLabels[mode]}</span>
            <strong>{testMode ? 'TEST MODE — results will not be saved' : studentName}</strong>
          </div>
          <button className="ghost" type="button" disabled={saving} onClick={onClose}>{testMode ? 'Exit test' : 'Exit activity'}</button>
        </header>

        {needsSetup ? (
          <section className="typing-runner-empty">
            <span>⌨️</span>
            <h1>This typing activity needs more setup.</h1>
            <p>Edit <strong>{assignmentTitle}</strong> in Assignment Library and {mode === 'passage' ? 'add a typing passage' : 'choose at least one practice key'} before launching it.</p>
            <button className="primary" type="button" onClick={onClose}>Back to Learning Hub</button>
          </section>
        ) : finished ? (
          <section className="typing-results">
            <span className="typing-results-icon">🎉</span>
            <span className="learning-kicker">{modeLabels[mode]} complete</span>
            <h1>{assignmentTitle}</h1>
            <p>{testMode ? 'Test complete. Nothing was assigned, recorded, or added to student history.' : studentName + '’s result was saved automatically to this week’s assignment.'}</p>

            <div className="typing-results-grid">
              {showWpm ? (
                <article><strong>{liveStats.wpm.toFixed(1)}</strong><span>WPM</span>{targetWpm != null && <small className={targetWpmMet ? 'met' : ''}>Goal {targetWpm}</small>}</article>
              ) : (
                <article><strong>{liveStats.correctCharacters}</strong><span>Correct keys</span><small>{mistakeTotal(liveStats.mistakes)} mistakes</small></article>
              )}
              <article><strong>{liveStats.accuracy.toFixed(1)}%</strong><span>Accuracy</span>{targetAccuracy != null && <small className={targetAccuracyMet ? 'met' : ''}>Goal {targetAccuracy}%</small>}</article>
              <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Time</span><small>{liveStats.correctCharacters}/{liveStats.typedCharacters} correct attempts</small></article>
            </div>

            {focusKeys.length > 0 && <div className="typing-results-keys"><strong>Keys practiced:</strong>{focusKeys.map((key) => <span key={key}>{key === ' ' ? 'Space' : key.toUpperCase()}</span>)}</div>}
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
                <span className="learning-kicker">{modeLabels[mode]}</span>
                <h1>{assignmentTitle}</h1>
                <p>{mode === 'passage' && 'Type the passage below. The timer begins with the first character.'}{mode === 'letter_drill' && 'Practice only the selected keys. Focus on smooth, accurate movement.'}{mode === 'guided_keys' && 'Press the highlighted key. The next key appears after a correct press.'}{mode === 'hand_placement' && 'Keep your fingers on the home row and use the finger shown for each highlighted key.'}</p>
              </div>
              <div className="typing-live-stats">
                <article><strong>{startedAt == null ? '—' : showWpm ? liveStats.wpm.toFixed(1) : liveStats.correctCharacters}</strong><span>{showWpm ? 'WPM' : 'Correct'}</span></article>
                <article><strong>{startedAt == null ? '—' : liveStats.accuracy.toFixed(1) + '%'}</strong><span>Accuracy</span></article>
                <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Time</span></article>
              </div>
            </div>

            {(targetWpm != null || targetAccuracy != null) && (
              <div className="typing-goals">
                <strong>Goals</strong>
                {showWpm && targetWpm != null && <span className={startedAt != null && targetWpmMet ? 'met' : ''}>⌨️ {targetWpm} WPM</span>}
                {targetAccuracy != null && <span className={startedAt != null && targetAccuracyMet ? 'met' : ''}>🎯 {targetAccuracy}% accuracy</span>}
              </div>
            )}

            <div className="typing-progress-line"><span style={{ width: progress + '%' }} /></div>

            {guidedMode ? (
              <div className="typing-guided-workspace" ref={guidedRef} tabIndex={0} onKeyDown={handleGuidedKey}>
                {mode === 'hand_placement' && (
                  <div className="typing-hand-home">
                    <strong>Home row starting position</strong>
                    <div><span>A</span><span>S</span><span>D</span><span className="anchor">F</span><i /><span className="anchor">J</span><span>K</span><span>L</span><span>;</span></div>
                    <small>Feel for the raised bumps on F and J. Keep both index fingers there between presses.</small>
                  </div>
                )}

                <div className={'typing-key-prompt ' + (lastKeyState ?? '')}>
                  <span>Next key</span>
                  <strong>{expectedKey === ' ' ? 'SPACE' : expectedKey.toUpperCase()}</strong>
                  <small>{fingerByKey[expectedKey] ?? 'Use the matching finger'}</small>
                </div>

                <div className="typing-keyboard" aria-label="On-screen keyboard guide">
                  {keyboardRows.map((row, rowIndex) => (
                    <div className="typing-keyboard-row" key={rowIndex}>
                      {row.map((key) => <span className={(expectedKey === key ? 'target ' : '') + ((key === 'f' || key === 'j') ? 'home-anchor' : '')} key={key}><b>{key.toUpperCase()}</b><small>{fingerByKey[key]?.replace('Left ','L ').replace('Right ','R ')}</small></span>)}
                    </div>
                  ))}
                  <div className="typing-keyboard-row space-row"><span className={expectedKey === ' ' ? 'target space-key' : 'space-key'}><b>SPACE</b><small>Thumb</small></span></div>
                </div>

                <div className="typing-guided-hint">Click this activity area if the keyboard stops responding, then keep typing.</div>
              </div>
            ) : (
              <>
                <div className="typing-passage" aria-label={mode === 'letter_drill' ? 'Letter drill' : 'Typing passage'}>
                  {Array.from(targetText).map((character, index) => {
                    let state = 'pending'
                    if (index < typed.length) state = typed[index] === character ? 'correct' : 'incorrect'
                    else if (index === typed.length) state = 'current'
                    return <span className={state} key={index}>{character === ' ' ? '\u00a0' : character}</span>
                  })}
                </div>

                {mode === 'letter_drill' && (
                  <div className="typing-focus-keys">{focusKeys.map((key) => <span key={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}<small>{fingerByKey[key] ?? ''}</small></span>)}</div>
                )}

                <label className="typing-input-wrap">
                  <span>Type here</span>
                  <textarea
                    ref={textareaRef}
                    value={typed}
                    maxLength={targetText.length}
                    rows={5}
                    onChange={(event) => handleTyping(event.target.value)}
                    onPaste={(event) => event.preventDefault()}
                    onDrop={(event) => event.preventDefault()}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={mode === 'letter_drill' ? 'Start the key drill…' : 'Start typing the passage…'}
                  />
                </label>
              </>
            )}

            <div className="typing-bottom-bar">
              <span><strong>{completedUnits}</strong> / {targetText.length} correct target keys • {progress}% complete{guidedMode && guidedAttempts > guidedIndex ? ' • ' + (guidedAttempts - guidedIndex) + ' mistakes' : ''}</span>
              <div>
                <button className="ghost" type="button" disabled={saving || (guidedMode ? guidedAttempts === 0 : typed.length === 0)} onClick={resetAttempt}>Reset</button>
                <button className="primary" type="button" disabled={saving || !complete || startedAt == null} onClick={() => void finishAttempt()}>{saving ? 'Saving…' : complete ? 'Finish & save result' : 'Finish practice first'}</button>
              </div>
            </div>

            {saveWarning && <div className="notice">{saveWarning}</div>}
          </section>
        )}
      </main>
    </div>
  )
}
