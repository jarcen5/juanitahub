'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ReadingQuestionType = 'multiple_choice' | 'main_idea' | 'detail' | 'vocabulary' | 'short_answer'

export type ReadingQuestion = {
  id: string
  type: ReadingQuestionType
  prompt: string
  choices?: string[]
  correct_answer?: string
  explanation?: string
}

export type ReadingConfig = {
  passage?: string
  questions?: ReadingQuestion[]
  passing_score?: number
  show_explanations?: boolean
}

export type ReadingAnswer = {
  question_id: string
  response: string
  correct: boolean | null
}

type Props = {
  studentAssignmentId?: number
  childId?: number
  assignmentId?: number
  assignmentTitle: string
  studentName?: string
  activityConfig: ReadingConfig | null
  userId?: string
  testMode?: boolean
  onClose: () => void
  onSaved?: () => Promise<void> | void
}

const typeLabels: Record<ReadingQuestionType, string> = {
  multiple_choice: 'Multiple choice',
  main_idea: 'Main idea',
  detail: 'Supporting detail',
  vocabulary: 'Vocabulary in context',
  short_answer: 'Short response',
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

export default function ReadingActivityRunner({
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
  const passage = activityConfig?.passage?.trim() ?? ''
  const questions = activityConfig?.questions ?? []
  const passingScore = Math.max(0, Math.min(100, Number(activityConfig?.passing_score ?? 80)))
  const showExplanations = activityConfig?.show_explanations !== false

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [firstAnswerAt, setFirstAnswerAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [readingProgress, setReadingProgress] = useState(0)
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [lineSpacing, setLineSpacing] = useState<'normal' | 'relaxed'>('relaxed')
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [message, setMessage] = useState('')
  const passageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!passage || startedAt != null) return
    setStartedAt(Date.now())
  }, [passage, startedAt])

  useEffect(() => {
    if (startedAt == null || finished) return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [startedAt, finished])

  const objectiveQuestions = useMemo(() => questions.filter((question) => question.type !== 'short_answer'), [questions])
  const writtenQuestions = useMemo(() => questions.filter((question) => question.type === 'short_answer'), [questions])
  const answeredCount = useMemo(() => questions.filter((question) => answers[question.id]?.trim()).length, [questions, answers])
  const allAnswered = questions.length > 0 && answeredCount === questions.length

  const evaluated = useMemo(() => {
    return questions.map<ReadingAnswer>((question) => {
      const response = answers[question.id]?.trim() ?? ''
      if (question.type === 'short_answer') return { question_id: question.id, response, correct: null }
      return {
        question_id: question.id,
        response,
        correct: Boolean(question.correct_answer) && normalize(response) === normalize(question.correct_answer ?? ''),
      }
    })
  }, [questions, answers])

  const objectiveCorrect = evaluated.filter((answer) => answer.correct === true).length
  const objectivePercent = objectiveQuestions.length ? (objectiveCorrect / objectiveQuestions.length) * 100 : 0
  const autoPass = objectiveQuestions.length ? objectivePercent >= passingScore : true

  function handleAnswer(questionId: string, value: string) {
    if (firstAnswerAt == null && value.trim()) setFirstAnswerAt(Date.now())
    setAnswers((current) => ({ ...current, [questionId]: value }))
    if (message) setMessage('')
  }

  function handlePassageScroll() {
    const element = passageRef.current
    if (!element) return
    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) {
      setReadingProgress(100)
      return
    }
    setReadingProgress(Math.max(0, Math.min(100, Math.round((element.scrollTop / maxScroll) * 100))))
  }

  async function submitReading() {
    if (!allAnswered || saving || !questions.length || startedAt == null) return

    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const readingSeconds = Math.max(1, Math.min(durationSeconds, Math.round(((firstAnswerAt ?? Date.now()) - startedAt) / 1000)))
    const reviewStatus = writtenQuestions.length ? 'pending' : 'not_needed'
    const finalPercent = questions.length && !writtenQuestions.length ? Math.round((objectiveCorrect / questions.length) * 10000) / 100 : null

    if (testMode) {
      setElapsedSeconds(durationSeconds)
      setFinished(true)
      return
    }

    if (!studentAssignmentId || !childId || !assignmentId || !userId) {
      setMessage('This reading activity is missing the assignment information needed to save.')
      return
    }

    setSaving(true)
    setMessage('')
    const now = new Date().toISOString()

    const { error: attemptError } = await supabase.from('learning_reading_attempts').insert({
      student_assignment_id: studentAssignmentId,
      child_id: childId,
      assignment_id: assignmentId,
      answers: evaluated,
      objective_correct: objectiveCorrect,
      objective_count: objectiveQuestions.length,
      written_count: writtenQuestions.length,
      review_status: reviewStatus,
      reading_seconds: readingSeconds,
      duration_seconds: durationSeconds,
      completed_by: userId,
      submitted_at: now,
      updated_at: now,
    })

    if (attemptError) {
      setSaving(false)
      setMessage(attemptError.message)
      return
    }

    const assignmentUpdate: Record<string, unknown> = {
      status: 'completed',
      completed_at: now,
      minutes_spent: Math.max(1, Math.ceil(durationSeconds / 60)),
      updated_by: userId,
      updated_at: now,
    }

    if (writtenQuestions.length === 0) {
      assignmentUpdate.score = objectiveCorrect
      assignmentUpdate.max_score = questions.length
      assignmentUpdate.staff_note = 'Reading comprehension: ' + objectiveCorrect + '/' + questions.length + ' • ' + (finalPercent ?? 0).toFixed(1) + '%'
    } else {
      assignmentUpdate.score = null
      assignmentUpdate.max_score = null
      assignmentUpdate.staff_note = 'Reading submitted • ' + objectiveCorrect + '/' + objectiveQuestions.length + ' objective correct • ' + writtenQuestions.length + ' response' + (writtenQuestions.length === 1 ? '' : 's') + ' awaiting review'
    }

    const { error: assignmentError } = await supabase
      .from('learning_student_assignments')
      .update(assignmentUpdate)
      .eq('id', studentAssignmentId)

    setSaving(false)

    if (assignmentError) {
      setMessage('Reading attempt was saved, but the assignment summary could not be updated: ' + assignmentError.message)
      return
    }

    setElapsedSeconds(durationSeconds)
    setFinished(true)
    if (onSaved) await onSaved()
  }

  function resetTest() {
    setAnswers({})
    setStartedAt(Date.now())
    setFirstAnswerAt(null)
    setElapsedSeconds(0)
    setReadingProgress(0)
    setFinished(false)
    setMessage('')
    passageRef.current?.scrollTo({ top: 0 })
  }

  if (!passage || !questions.length) {
    return (
      <div className="reading-runner-backdrop">
        <main className={'reading-runner-shell' + (testMode ? ' test-mode' : '')}>
          {testMode && <div className="reading-test-banner"><strong>TEST MODE</strong><span>No attempts, scores, or progress will be saved.</span></div>}
          <header className="reading-runner-topbar"><div><span className="learning-kicker">Juanita Hub Reading Lab</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div><button className="ghost" type="button" onClick={onClose}>Exit</button></header>
          <section className="reading-runner-empty"><span>📖</span><h1>This reading activity needs {passage ? 'questions' : 'a passage'}.</h1><p>Edit <strong>{assignmentTitle}</strong> in Assignment Library and finish the Reading Lab setup.</p><button className="primary" type="button" onClick={onClose}>Back to Learning Hub</button></section>
        </main>
      </div>
    )
  }

  return (
    <div className="reading-runner-backdrop">
      <main className={'reading-runner-shell' + (testMode ? ' test-mode' : '')}>
        {testMode && <div className="reading-test-banner"><strong>TEST MODE</strong><span>Read and answer exactly like a student. Nothing is assigned, scored, or saved.</span></div>}

        <header className="reading-runner-topbar">
          <div><span className="learning-kicker">Juanita Hub Reading Lab</span><strong>{testMode ? 'Staff Test' : studentName}</strong></div>
          <div className="reading-runner-top-actions"><span>{timeLabel(elapsedSeconds)}</span><button className="ghost" type="button" disabled={saving} onClick={onClose}>{testMode ? 'Exit test' : 'Exit reading'}</button></div>
        </header>

        {finished ? (
          <section className="reading-results">
            <span className="reading-results-icon">{writtenQuestions.length ? '📝' : autoPass ? '🎉' : '📘'}</span>
            <span className="learning-kicker">{testMode ? 'Test complete' : 'Reading submitted'}</span>
            <h1>{assignmentTitle}</h1>
            <p>{testMode ? 'Nothing was saved. This is the same result flow a student will see.' : writtenQuestions.length ? 'Your objective answers were checked. Staff will review the written response before the final score is complete.' : 'Your reading result was saved automatically.'}</p>

            <div className="reading-results-grid">
              <article><strong>{objectiveCorrect}/{objectiveQuestions.length}</strong><span>Objective</span><small>{objectiveQuestions.length ? objectivePercent.toFixed(1) + '%' : 'No objective questions'}</small></article>
              <article><strong>{writtenQuestions.length || '—'}</strong><span>Written responses</span><small>{writtenQuestions.length ? 'Staff review' : 'None'}</small></article>
              <article><strong>{timeLabel(elapsedSeconds)}</strong><span>Activity time</span><small>Reading + questions</small></article>
            </div>

            {showExplanations && objectiveQuestions.length > 0 && (
              <section className="reading-answer-review">
                <h2>Answer review</h2>
                {objectiveQuestions.map((question, index) => {
                  const answer = evaluated.find((item) => item.question_id === question.id)
                  return (
                    <article className={answer?.correct ? 'correct' : 'incorrect'} key={question.id}>
                      <span>{answer?.correct ? '✓' : '✕'}</span>
                      <div><strong>{index + 1}. {question.prompt}</strong>{!answer?.correct && <small>Correct answer: {question.correct_answer}</small>}{question.explanation && <p>{question.explanation}</p>}</div>
                    </article>
                  )
                })}
              </section>
            )}

            {message && <div className="notice">{message}</div>}
            <div className="reading-results-actions">{testMode && <button className="ghost" type="button" onClick={resetTest}>Test again</button>}<button className="primary" type="button" onClick={onClose}>Done</button></div>
          </section>
        ) : (
          <section className="reading-workspace">
            <div className="reading-activity-heading">
              <div><span className="learning-kicker">Reading comprehension</span><h1>{assignmentTitle}</h1><p>Keep the passage open while you answer the questions.</p></div>
              <div className="reading-activity-progress"><strong>{answeredCount}/{questions.length}</strong><span>answered</span></div>
            </div>

            <div className="reading-layout">
              <section className="reading-passage-panel">
                <header>
                  <div><span className="learning-kicker">Passage</span><strong>Read carefully</strong></div>
                  <div className="reading-display-controls">
                    <button className={fontSize === 'small' ? 'active' : ''} type="button" onClick={() => setFontSize('small')}>A−</button>
                    <button className={fontSize === 'medium' ? 'active' : ''} type="button" onClick={() => setFontSize('medium')}>A</button>
                    <button className={fontSize === 'large' ? 'active' : ''} type="button" onClick={() => setFontSize('large')}>A+</button>
                    <button className={lineSpacing === 'relaxed' ? 'active' : ''} type="button" onClick={() => setLineSpacing((value) => value === 'relaxed' ? 'normal' : 'relaxed')}>↕ Lines</button>
                  </div>
                </header>
                <div className="reading-passage-progress"><span style={{ width: readingProgress + '%' }} /></div>
                <div ref={passageRef} className={'reading-passage-text ' + fontSize + ' ' + lineSpacing} onScroll={handlePassageScroll}>{passage}</div>
              </section>

              <section className="reading-question-panel">
                <div className="reading-question-list">
                  {questions.map((question, index) => {
                    const choiceQuestion = question.type !== 'short_answer'
                    return (
                      <article className="reading-question-card" key={question.id}>
                        <div className="reading-question-label"><span>Question {index + 1}</span><small>{typeLabels[question.type]}</small></div>
                        <h2>{question.prompt}</h2>

                        {choiceQuestion ? (
                          <div className="reading-choice-list">
                            {(question.choices ?? []).map((choice) => (
                              <button className={answers[question.id] === choice ? 'selected' : ''} type="button" key={choice} onClick={() => handleAnswer(question.id, choice)}>{choice}</button>
                            ))}
                          </div>
                        ) : (
                          <label className="reading-short-answer"><span>Your response</span><textarea rows={5} value={answers[question.id] ?? ''} onChange={(event) => handleAnswer(question.id, event.target.value)} placeholder="Answer in your own words…" /></label>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>

            <footer className="reading-submit-bar">
              <span>{allAnswered ? 'All questions answered.' : (questions.length - answeredCount) + ' question' + (questions.length - answeredCount === 1 ? '' : 's') + ' left.'}</span>
              <button className="primary" type="button" disabled={saving || !allAnswered} onClick={() => void submitReading()}>{saving ? 'Submitting…' : writtenQuestions.length ? 'Submit for review' : 'Submit & score'}</button>
            </footer>
            {message && <div className="notice">{message}</div>}
          </section>
        )}
      </main>
    </div>
  )
}
