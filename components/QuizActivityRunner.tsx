'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type QuizQuestionType =
  | 'multiple_choice'
  | 'correct_sentence'
  | 'fill_blank'
  | 'spelling'
  | 'reading_comprehension'

export type QuizQuestion = {
  id: string
  type: QuizQuestionType
  prompt: string
  choices?: string[]
  correct_answer: string
  explanation?: string
  passage?: string
}

export type QuizConfig = {
  questions?: QuizQuestion[]
  passing_score?: number
  show_explanations?: boolean
}

type Props = {
  studentAssignmentId?: number
  childId?: number
  assignmentId?: number
  assignmentTitle: string
  studentName?: string
  activityConfig: QuizConfig | null
  userId?: string
  testMode?: boolean
  onClose: () => void
  onSaved?: () => Promise<void> | void
}

type AnswerRow = {
  question_id: string
  response: string
  correct: boolean
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

function typeLabel(type: QuizQuestionType) {
  if (type === 'multiple_choice') return 'Multiple choice'
  if (type === 'correct_sentence') return 'Correct sentence'
  if (type === 'fill_blank') return 'Fill in the blank'
  if (type === 'spelling') return 'Spelling / vocabulary'
  return 'Reading comprehension'
}

export default function QuizActivityRunner({
  studentAssignmentId,
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
  const questions = activityConfig?.questions ?? []
  const passingScore = Math.max(0, Math.min(100, Number(activityConfig?.passing_score ?? 80)))
  const showExplanations = activityConfig?.show_explanations !== false

  const [questionIndex, setQuestionIndex] = useState(0)
  const [response, setResponse] = useState('')
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [checked, setChecked] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')

  const current = questions[questionIndex] ?? null
  const currentCorrect = current ? normalize(response) === normalize(current.correct_answer) : false
  const choiceQuestion = current ? ['multiple_choice', 'correct_sentence'].includes(current.type) || ((current.choices?.length ?? 0) >= 2) : false

  useEffect(() => {
    if (startedAt == null || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [startedAt, finished])

  const correctCount = useMemo(() => answers.filter((answer) => answer.correct).length, [answers])
  const percent = questions.length ? (correctCount / questions.length) * 100 : 0
  const passed = percent >= passingScore

  function startIfNeeded() {
    if (startedAt == null) setStartedAt(Date.now())
  }

  function checkAnswer() {
    if (!current || checked || !response.trim()) return
    startIfNeeded()
    const row: AnswerRow = {
      question_id: current.id,
      response: response.trim(),
      correct: normalize(response) === normalize(current.correct_answer),
    }
    setAnswers((currentAnswers) => [...currentAnswers, row])
    setChecked(true)
  }

  async function nextQuestion() {
    if (!checked) return
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((value) => value + 1)
      setResponse('')
      setChecked(false)
      return
    }
    await finishQuiz()
  }

  async function finishQuiz() {
    if (saving || !questions.length || answers.length !== questions.length) return

    const finalSeconds = Math.max(1, startedAt == null ? 1 : Math.round((Date.now() - startedAt) / 1000))
    const finalCorrect = answers.filter((answer) => answer.correct).length
    const finalPercent = Math.round((finalCorrect / questions.length) * 10000) / 100
    const note = 'Quiz: ' + finalCorrect + '/' + questions.length + ' • ' + finalPercent.toFixed(1) + '%'

    if (testMode) {
      setElapsedSeconds(finalSeconds)
      setFinished(true)
      return
    }

    if (!studentAssignmentId || !childId || !assignmentId || !userId) {
      setSaveWarning('This quiz is missing the assignment information needed to save a result.')
      return
    }

    setSaving(true)
    setSaveWarning('')

    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        score: finalCorrect,
        max_score: questions.length,
        minutes_spent: Math.max(1, Math.ceil(finalSeconds / 60)),
        staff_note: note,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentAssignmentId)

    if (assignmentError) {
      setSaving(false)
      setSaveWarning(assignmentError.message)
      return
    }

    const { error: attemptError } = await supabase.from('learning_quiz_attempts').insert({
      student_assignment_id: studentAssignmentId,
      child_id: childId,
      assignment_id: assignmentId,
      answers,
      correct_count: finalCorrect,
      question_count: questions.length,
      percent: finalPercent,
      duration_seconds: finalSeconds,
      completed_by: userId,
    })

    setElapsedSeconds(finalSeconds)
    setFinished(true)
    setSaving(false)
    if (attemptError) setSaveWarning('The assignment was completed, but the quiz-attempt history could not be saved: ' + attemptError.message)
    if (onSaved) await onSaved()
  }

  function resetQuiz() {
    setQuestionIndex(0)
    setResponse('')
    setAnswers([])
    setChecked(false)
    setStartedAt(null)
    setElapsedSeconds(0)
    setFinished(false)
    setSaving(false)
    setSaveWarning('')
  }

  if (!questions.length) {
    return (
      <div className="quiz-runner-backdrop">
        <main className={'quiz-runner-shell' + (testMode ? ' test-mode' : '')}>
          {testMode && <div className="quiz-test-banner"><strong>TEST MODE</strong><span>No scores, attempts, or progress will be saved.</span></div>}
          <header className="quiz-runner-topbar"><div><span className="learning-kicker">Juanita Hub Quiz Lab</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div><button className="ghost" type="button" onClick={onClose}>Exit</button></header>
          <section className="quiz-runner-empty"><span>🧠</span><h1>This quiz needs questions.</h1><p>Edit <strong>{assignmentTitle}</strong> in Assignment Library and add at least one question.</p><button className="primary" type="button" onClick={onClose}>Back to Learning Hub</button></section>
        </main>
      </div>
    )
  }

  return (
    <div className="quiz-runner-backdrop">
      <main className={'quiz-runner-shell' + (testMode ? ' test-mode' : '')}>
        {testMode && <div className="quiz-test-banner"><strong>TEST MODE</strong><span>Use the quiz exactly like a student. Nothing is assigned, scored, or saved.</span></div>}

        <header className="quiz-runner-topbar">
          <div><span className="learning-kicker">Juanita Hub Quiz Lab</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div>
          <div className="quiz-runner-top-actions"><span>{timeLabel(elapsedSeconds)}</span><button className="ghost" type="button" disabled={saving} onClick={onClose}>{testMode ? 'Exit test' : 'Exit quiz'}</button></div>
        </header>

        {finished ? (
          <section className="quiz-results">
            <span className="quiz-results-icon">{passed ? '🎉' : '📘'}</span>
            <span className="learning-kicker">{testMode ? 'Test complete' : 'Quiz complete'}</span>
            <h1>{assignmentTitle}</h1>
            <p>{testMode ? 'Nothing was saved. This is exactly how the quiz result screen will behave for a student.' : studentName + '’s score was saved automatically.'}</p>

            <div className="quiz-results-grid">
              <article><strong>{correctCount}/{questions.length}</strong><span>Correct</span><small>{questions.length - correctCount} missed</small></article>
              <article><strong>{percent.toFixed(1)}%</strong><span>Score</span><small>Goal {passingScore}%</small></article>
              <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Time</span><small>{passed ? 'Goal met' : 'Keep practicing'}</small></article>
            </div>

            <div className={'quiz-result-message ' + (passed ? 'passed' : 'practice')}>
              <strong>{passed ? 'Goal met!' : 'More practice will help.'}</strong>
              <span>{passed ? 'Nice work completing the quiz at or above the goal.' : 'Try the activity again after reviewing the missed questions.'}</span>
            </div>

            {saveWarning && <div className="notice">{saveWarning}</div>}
            <div className="quiz-results-actions"><button className="ghost" type="button" onClick={resetQuiz}>Try again</button><button className="primary" type="button" onClick={onClose}>Done</button></div>
          </section>
        ) : current ? (
          <section className="quiz-workspace">
            <div className="quiz-progress-heading">
              <div><span className="learning-kicker">{typeLabel(current.type)}</span><h1>{assignmentTitle}</h1></div>
              <strong>Question {questionIndex + 1} of {questions.length}</strong>
            </div>
            <div className="quiz-progress-track"><span style={{ width: ((questionIndex + (checked ? 1 : 0)) / questions.length) * 100 + '%' }} /></div>

            <article className="quiz-question-card">
              {current.passage && <section className="quiz-reading-passage"><span>Read this first</span><p>{current.passage}</p></section>}
              <h2>{current.prompt}</h2>

              {choiceQuestion ? (
                <div className="quiz-choice-list">
                  {(current.choices ?? []).map((choice) => {
                    const selected = response === choice
                    const correctChoice = checked && normalize(choice) === normalize(current.correct_answer)
                    const wrongSelected = checked && selected && !correctChoice
                    return (
                      <button
                        className={(selected ? 'selected ' : '') + (correctChoice ? 'correct ' : '') + (wrongSelected ? 'incorrect' : '')}
                        type="button"
                        key={choice}
                        disabled={checked}
                        onClick={() => { startIfNeeded(); setResponse(choice) }}
                      >
                        <span>{choice}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <label className="quiz-text-answer">
                  <span>Your answer</span>
                  <input
                    value={response}
                    disabled={checked}
                    onFocus={startIfNeeded}
                    onChange={(event) => { startIfNeeded(); setResponse(event.target.value) }}
                    placeholder={current.type === 'spelling' ? 'Type the word…' : 'Type your answer…'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              )}

              {checked && (
                <div className={'quiz-feedback ' + (currentCorrect ? 'correct' : 'incorrect')}>
                  <strong>{currentCorrect ? '✓ Correct' : '✕ Not quite'}</strong>
                  {!currentCorrect && <span>Correct answer: <b>{current.correct_answer}</b></span>}
                  {showExplanations && current.explanation && <p>{current.explanation}</p>}
                </div>
              )}
            </article>

            <div className="quiz-bottom-actions">
              <span>{answers.filter((answer) => answer.correct).length} correct so far</span>
              {!checked
                ? <button className="primary" type="button" disabled={!response.trim()} onClick={checkAnswer}>Check answer</button>
                : <button className="primary" type="button" disabled={saving} onClick={() => void nextQuestion()}>{saving ? 'Saving…' : questionIndex === questions.length - 1 ? 'Finish quiz' : 'Next question'}</button>}
            </div>

            {saveWarning && <div className="notice">{saveWarning}</div>}
          </section>
        ) : null}
      </main>
    </div>
  )
}
