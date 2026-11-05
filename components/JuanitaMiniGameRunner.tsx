'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'
import {
  colorByMathPalette,
  miniGameLabels,
  type MiniGameConfig,
  type MiniGameQuestion,
} from '@/lib/juanitaMiniGames'

export type MiniGameAnswer = { question_id: string; response: string }

type PlayProps = {
  assignmentTitle: string
  studentName: string
  activityConfig: MiniGameConfig | null
  onClose: () => void
  onFinish?: (answers: MiniGameAnswer[], durationSeconds: number) => Promise<void>
  preview?: boolean
}

type AssignedProps = {
  studentAssignmentId: number
  childId: number
  assignmentId: number
  assignmentTitle: string
  studentName: string
  activityConfig: MiniGameConfig | null
  studentAccess: StudentAccessContext
  onClose: () => void
  onSaved?: () => Promise<void> | void
}

function sameAnswer(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

function speakWithBrowser(message: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = 'en-US'
    utterance.rate = 0.82
    utterance.pitch = 1.05
    window.speechSynthesis.speak(utterance)
  } catch {
    // The games must remain fully usable if speech is unavailable.
  }
}

function GamePlay({ assignmentTitle, studentName, activityConfig, onClose, onFinish, preview = false }: PlayProps) {
  const questions = useMemo(() => activityConfig?.questions ?? [], [activityConfig])
  const kind = activityConfig?.mini_game ?? 'block_builder'
  const info = miniGameLabels[kind]
  const [round, setRound] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [successIds, setSuccessIds] = useState<string[]>([])
  const [response, setResponse] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'wrong' | 'correct'>('idle')
  const [blockCount, setBlockCount] = useState(0)
  const [wordEnding, setWordEnding] = useState('')
  const [colorNumber, setColorNumber] = useState<number | null>(null)
  const [painted, setPainted] = useState<Record<string, number>>({})
  const [soundOn, setSoundOn] = useState(true)
  const [phase, setPhase] = useState<'playing' | 'saving' | 'save_error' | 'finished'>('playing')
  const [saveError, setSaveError] = useState('')
  const startedAt = useRef(Date.now())
  const firstName = studentName.trim().split(' ')[0] || 'Explorer'
  const question = questions[round] ?? null
  const isPainting = kind === 'color_by_math'
  const paintedCount = Object.keys(painted).length
  const completedCount = isPainting ? paintedCount : successIds.length
  const readyToFinish = isPainting && paintedCount === questions.length && questions.length > 0

  function say(message: string) {
    if (soundOn) speakWithBrowser(message)
  }

  useEffect(() => {
    if (phase !== 'playing' || isPainting || !question || !soundOn) return
    // Speech is optional; the on-screen picture and large controls always remain usable.
    const timer = window.setTimeout(() => speakWithBrowser(question.spoken_prompt || question.prompt), 250)
    return () => window.clearTimeout(timer)
  }, [question, isPainting, phase, soundOn])

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  function keepFirstAnswer(current: MiniGameQuestion, chosen: string) {
    if (Object.prototype.hasOwnProperty.call(answers, current.id)) return
    setAnswers((previous) => ({ ...previous, [current.id]: chosen }))
  }

  function markCorrect(current: MiniGameQuestion, message: string) {
    setFeedback('correct')
    setSuccessIds((ids) => ids.includes(current.id) ? ids : [...ids, current.id])
    say(message)
  }

  function tryAnswer(current: MiniGameQuestion, chosen: string, spokenCorrect: string) {
    if (feedback === 'correct' || phase !== 'playing') return
    keepFirstAnswer(current, chosen)
    setResponse(chosen)
    if (sameAnswer(chosen, current.correct_answer)) {
      markCorrect(current, spokenCorrect)
    } else {
      setFeedback('wrong')
      say('Not quite. Try again!')
    }
  }

  function addBlock() {
    if (feedback === 'correct') return
    setBlockCount((value) => Math.min(10, value + 1))
    setFeedback('idle')
  }

  function takeBlock() {
    if (feedback === 'correct') return
    setBlockCount((value) => Math.max(0, value - 1))
    setFeedback('idle')
  }

  function finishAnswers() {
    return questions.map((item) => ({ question_id: item.id, response: answers[item.id] ?? '' }))
  }

  async function finish() {
    if (phase === 'saving' || phase === 'finished' || completedCount !== questions.length) return
    setPhase('saving')
    setSaveError('')
    try {
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
      if (onFinish) await onFinish(finishAnswers(), durationSeconds)
      setPhase('finished')
      say('Amazing! You finished the game!')
    } catch (error) {
      setPhase('save_error')
      setSaveError(error instanceof Error ? error.message : 'Your progress could not be saved. Please try again.')
    }
  }

  function nextRound() {
    if (feedback !== 'correct') return
    if (round === questions.length - 1) {
      void finish()
      return
    }
    setRound((value) => value + 1)
    setBlockCount(0)
    setWordEnding('')
    setFeedback('idle')
    setResponse('')
  }

  function paintCell(cell: MiniGameQuestion) {
    if (phase !== 'playing' || painted[cell.id] != null || colorNumber == null) return
    keepFirstAnswer(cell, String(colorNumber))
    if (String(colorNumber) !== cell.correct_answer) {
      setFeedback('wrong')
      say('Try another color!')
      return
    }
    setPainted((previous) => ({ ...previous, [cell.id]: colorNumber }))
    setSuccessIds((ids) => ids.includes(cell.id) ? ids : [...ids, cell.id])
    setFeedback('correct')
    say('You painted it!')
  }

  function resetForReplay() {
    setRound(0)
    setAnswers({})
    setSuccessIds([])
    setResponse('')
    setFeedback('idle')
    setBlockCount(0)
    setWordEnding('')
    setColorNumber(null)
    setPainted({})
    setPhase('playing')
    setSaveError('')
    startedAt.current = Date.now()
  }

  if (questions.length === 0 || !activityConfig || !miniGameLabels[activityConfig.mini_game]) {
    return (
      <div className="jqmini-backdrop">
        <section className="jqmini-shell jqmini-empty" role="dialog" aria-modal="true" aria-label="Mini-game unavailable">
          <h1>Game not ready</h1><p>Ask a staff member to choose another game.</p>
          <button className="jqmini-primary" type="button" onClick={onClose}>Back to My Week</button>
        </section>
      </div>
    )
  }

  const nextLabel = round === questions.length - 1 ? 'Finish game 🏆' : 'Next challenge →'

  return (
    <div className="jqmini-backdrop">
      <main className="jqmini-shell" role="dialog" aria-modal="true" aria-label={assignmentTitle}>
        <header className="jqmini-header">
          <div className="jqmini-identity"><span className="jqmini-logo">JQ</span><span><strong>Juanita Quest</strong><small>{preview ? 'Safe practice preview · Nothing saved' : 'Your own mini-game'}</small></span></div>
          <div className="jqmini-header-actions">
            <button className="jqmini-sound" type="button" aria-label={soundOn ? 'Turn speech off' : 'Turn speech on'} aria-pressed={soundOn} onClick={() => { setSoundOn(v => !v); if (soundOn && 'speechSynthesis' in window) window.speechSynthesis.cancel() }}>{soundOn ? '🔊' : '🔇'}</button>
            <button className="jqmini-exit" type="button" onClick={onClose} disabled={phase === 'saving'}>✕ Exit</button>
          </div>
        </header>

        {phase === 'finished' ? (
          <section className="jqmini-finished">
            <div className="jqmini-trophy">🏆</div>
            <span className="jqmini-kicker">ALL DONE!</span>
            <h1>Great job, {firstName}!</h1>
            <p>You finished {info.label}!</p>
            <div className="jqmini-finish-stars" aria-label={questions.length + ' activities completed'}>🌟 🌟 🌟</div>
            <strong>{questions.length} challenges completed</strong>
            {preview && <p className="jqmini-preview-note">This was practice only. No student record was changed.</p>}
            <div className="jqmini-finish-actions">
              <button className="jqmini-primary" type="button" onClick={resetForReplay}>Play again ↻</button>
              <button className="jqmini-secondary" type="button" onClick={onClose}>{preview ? 'Back to staff view' : 'Back to My Week'}</button>
            </div>
          </section>
        ) : (
          <>
            <div className="jqmini-banner" style={{ '--jqmini-accent': info.color } as React.CSSProperties}>
              <div className="jqmini-banner-icon" aria-hidden="true">{info.icon}</div>
              <div><span className="jqmini-kicker">{isPainting ? 'Paint the picture!' : 'A game just for you'}</span><h1>{info.label}</h1><p>{firstName}, earn stars by practicing!</p></div>
              <div className="jqmini-progress"><strong>⭐ {completedCount}/{questions.length}</strong><div className="jqmini-progress-track" aria-hidden="true"><span style={{ width: completedCount / questions.length * 100 + '%' }} /></div></div>
            </div>

            {phase === 'save_error' && <section className="jqmini-save-error" role="alert">
              <h2>Progress wasn't saved yet</h2><p>{saveError}</p>
              <button className="jqmini-primary" type="button" onClick={() => void finish()}>Try saving again</button>
            </section>}

            {(phase === 'playing' || phase === 'saving') && <section className="jqmini-content">
              {isPainting ? (
                <div className="jqmini-paint-game">
                  <div className="jqmini-game-prompt">
                    <span className="jqmini-round">Flower picture 🌼</span>
                    <h2>Paint by adding!</h2>
                    <p>Pick a color. Tap the math squares.</p>
                    <button className="jqmini-hear" type="button" onClick={() => say('Pick a color number. Solve the addition in a square, and tap it to paint!')}>🔊 Hear instructions</button>
                  </div>
                  <div className="jqmini-palette" role="group" aria-label="Choose a paint color">
                    {colorByMathPalette.map((paint) => (
                      <button key={paint.number} type="button" className={colorNumber === paint.number ? 'selected' : ''} aria-pressed={colorNumber === paint.number} disabled={phase === 'saving'} onClick={() => { setColorNumber(paint.number); setFeedback('idle'); say(paint.number + ', ' + paint.name) }}>
                        <span style={{ backgroundColor: paint.color }} aria-hidden="true" />
                        <strong>{paint.number}</strong>
                        <small>{paint.name}</small>
                      </button>
                    ))}
                  </div>
                  <div className="jqmini-paint-board" aria-label="Color by math flower picture">
                    {questions.map((cell) => {
                      const done = painted[cell.id] != null
                      const paint = colorByMathPalette.find((item) => item.number === painted[cell.id])
                      return <button
                        key={cell.id}
                        type="button"
                        className={'jqmini-paint-square ' + (done ? 'painted' : '')}
                        style={done ? { backgroundColor: paint?.color } : undefined}
                        disabled={done || phase === 'saving'}
                        aria-label={done ? cell.prompt + ', painted ' + paint?.name : cell.prompt + ', choose matching color'}
                        onClick={() => paintCell(cell)}
                      >
                        {done ? <span aria-hidden="true">✦</span> : <strong>{cell.prompt}</strong>}
                      </button>
                    })}
                  </div>
                  <div className="jqmini-status" role="status" aria-live="polite">
                    {readyToFinish ? '🌼 Your flower is complete!' : colorNumber == null ? '👆 Choose a color to start' : feedback === 'wrong' ? '💛 Try a different color number.' : '🎨 Tap a square with the answer ' + colorNumber}
                  </div>
                  {readyToFinish && <button type="button" className="jqmini-primary jqmini-next" disabled={phase === 'saving'} onClick={() => void finish()}>{phase === 'saving' ? 'Saving…' : 'Finish painting! 🏆'}</button>}
                </div>
              ) : (
                <div className="jqmini-round-game" key={question?.id}>
                  <div className="jqmini-game-prompt">
                    <span className="jqmini-round">Round {round + 1} of {questions.length}</span>
                    <h2>{question?.prompt}</h2>
                    <button className="jqmini-hear" type="button" onClick={() => question && say(question.spoken_prompt || question.prompt)}>🔊 Hear it</button>
                  </div>

                  {kind === 'block_builder' && (
                    <div className="jqmini-block-game">
                      <div className="jqmini-number-target"><span>BUILD</span><strong>{question?.target_number ?? question?.correct_answer}</strong><small>blocks</small></div>
                      <div className="jqmini-block-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.getData('text/plain') === 'jqmini-block') addBlock() }} aria-label={blockCount + ' blocks built'}>
                        {blockCount ? Array.from({ length: blockCount }).map((_, index) => (
                          <button className="jqmini-block built" type="button" key={index} disabled={feedback === 'correct'} onClick={takeBlock} aria-label="Remove one block">🧱</button>
                        )) : <span className="jqmini-zone-hint">Tap or drag blocks here!</span>}
                      </div>
                      <div className="jqmini-builder-tools">
                        <button type="button" className="jqmini-block supply" draggable={feedback !== 'correct'} disabled={feedback === 'correct'} onClick={addBlock} onDragStart={(e) => e.dataTransfer.setData('text/plain','jqmini-block')} aria-label="Add one block">＋ 🧱 <small>Add block</small></button>
                        <button type="button" className="jqmini-secondary" disabled={feedback === 'correct' || blockCount === 0} onClick={takeBlock}>− Remove</button>
                        <button className="jqmini-primary" type="button" disabled={feedback === 'correct' || blockCount === 0} onClick={() => question && tryAnswer(question, String(blockCount), 'You built ' + blockCount + '!')}>✓ Check</button>
                      </div>
                    </div>
                  )}

                  {kind === 'word_workshop' && (
                    <div className="jqmini-word-game">
                      <div className="jqmini-big-picture" aria-label="Word picture">{question?.word_picture}</div>
                      <div className="jqmini-word-slots">
                        <strong>{question?.word_start}</strong>
                        <span className={'jqmini-word-slot '+(wordEnding ? 'filled' : '')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ending = e.dataTransfer.getData('text/plain'); if (question?.choices?.includes(ending) && feedback !== 'correct') { setWordEnding(ending); setFeedback('idle'); say((question.word_start ?? '') + ending) } }}>{wordEnding || '___'}</span>
                      </div>
                      <div className="jqmini-word-choices" role="group" aria-label="Pick a word ending">
                        {(question?.choices ?? []).map((ending) => <button key={ending} type="button" draggable={feedback !== 'correct'} disabled={feedback === 'correct'} className={wordEnding === ending ? 'selected' : ''} aria-pressed={wordEnding === ending} onDragStart={(e) => e.dataTransfer.setData('text/plain',ending)} onClick={() => { setWordEnding(ending); setFeedback('idle'); say((question?.word_start ?? '') + ending) }}>{ending}</button>)}
                      </div>
                      <button className="jqmini-primary" type="button" disabled={!wordEnding || feedback === 'correct'} onClick={() => question && tryAnswer(question, wordEnding, 'You made the word ' + (question.word_start ?? '') + wordEnding)}>✓ Check word</button>
                    </div>
                  )}

                  {kind === 'letter_landing' && (
                    <div className="jqmini-letter-game">
                      <div className="jqmini-big-picture" aria-label="Word picture">{question?.picture}</div>
                      <div className="jqmini-letter-choices" role="group" aria-label="Pick the first letter">
                        {(question?.choices ?? []).map((letter) => <button key={letter} className={response === letter ? (feedback === 'correct' ? 'correct' : 'tried') : ''} type="button" disabled={feedback === 'correct'} onClick={() => question && tryAnswer(question, letter, 'Yes! ' + letter + ' is for ' + (question.spoken_prompt?.split('.')[1]?.trim().split(' ')[0] || 'that word'))}>{letter.toUpperCase()}</button>)}
                      </div>
                    </div>
                  )}
                  <div className={'jqmini-status ' + feedback} role="status" aria-live="polite">
                    {feedback === 'correct' ? '🌟 You got it! Star earned!' : feedback === 'wrong' ? '💛 Almost! Try again.' : '✨ You can do it!'}
                  </div>
                  {feedback === 'correct' && <button type="button" className="jqmini-primary jqmini-next" disabled={phase === 'saving'} onClick={nextRound}>{phase === 'saving' ? 'Saving…' : nextLabel}</button>}
                </div>
              )}
            </section>}
          </>
        )}
      </main>
    </div>
  )
}

export default function JuanitaMiniGameRunner({ studentAssignmentId, assignmentTitle, studentName, activityConfig, studentAccess, onClose, onSaved }: AssignedProps) {
  async function save(answers: MiniGameAnswer[], durationSeconds: number) {
    await studentLearningRequest('save_quiz', {
      device_token: studentAccess.deviceToken,
      student_token: studentAccess.studentToken,
      student_assignment_id: studentAssignmentId,
      answers,
      duration_seconds: durationSeconds,
    })
    try { await onSaved?.() } catch {
      // The quiz result was already saved. A list refresh issue must not invite resubmission.
    }
  }
  return <GamePlay assignmentTitle={assignmentTitle} studentName={studentName} activityConfig={activityConfig} onClose={onClose} onFinish={save} />
}

export function JuanitaMiniGamePreview({ assignmentTitle, activityConfig, onClose }: { assignmentTitle: string; activityConfig: MiniGameConfig | null; onClose: () => void }) {
  return <GamePlay assignmentTitle={assignmentTitle} studentName="Explorer" activityConfig={activityConfig} onClose={onClose} preview />
}
