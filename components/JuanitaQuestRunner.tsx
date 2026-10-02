'use client'

import { useEffect, useMemo, useState } from 'react'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'
import type { QuizConfig, QuizQuestion } from '@/components/QuizActivityRunner'

export type JuanitaQuestConfig = QuizConfig & {
  experience?: 'juanita_quest'
  quest_world?: string
  quest_intro?: string
  quest_goal?: string
}

type Props = {
  studentAssignmentId: number
  childId: number
  assignmentId: number
  assignmentTitle: string
  studentName: string
  activityConfig: JuanitaQuestConfig | null
  studentAccess: StudentAccessContext
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

function missionLabel(question: QuizQuestion) {
  if (question.type === 'reading_comprehension') return 'Clue Mission'
  if (question.type === 'spelling') return 'Word Mission'
  if (question.type === 'fill_blank') return 'Code Mission'
  if (question.type === 'correct_sentence') return 'Fix-It Mission'
  return 'Choice Mission'
}

export default function JuanitaQuestRunner({
  studentAssignmentId,
  childId,
  assignmentId,
  assignmentTitle,
  studentName,
  activityConfig,
  studentAccess,
  onClose,
  onSaved,
}: Props) {
  const questions = activityConfig?.questions ?? []
  const passingScore = Math.max(0, Math.min(100, Number(activityConfig?.passing_score ?? 70)))
  const worldName = activityConfig?.quest_world?.trim() || 'Memory Islands'
  const intro = activityConfig?.quest_intro?.trim() || 'Explore each checkpoint, unlock the clues, and finish the mission.'
  const goal = activityConfig?.quest_goal?.trim() || 'Complete every checkpoint.'

  const [screen, setScreen] = useState<'intro' | 'play' | 'finished'>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [response, setResponse] = useState('')
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [checked, setChecked] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')

  const current = questions[questionIndex] ?? null
  const currentCorrect = current ? normalize(response) === normalize(current.correct_answer) : false
  const choiceQuestion = current
    ? ['multiple_choice', 'correct_sentence', 'reading_comprehension'].includes(current.type) || ((current.choices?.length ?? 0) >= 1)
    : false

  useEffect(() => {
    if (startedAt == null || screen === 'finished') return
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [startedAt, screen])

  const correctCount = useMemo(() => answers.filter((answer) => answer.correct).length, [answers])
  const percent = questions.length ? (correctCount / questions.length) * 100 : 0
  const questStars = answers.length + correctCount

  function startQuest() {
    setStartedAt(Date.now())
    setScreen('play')
  }

  function checkAnswer() {
    if (!current || checked || !response.trim()) return
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
    await finishQuest()
  }

  async function finishQuest() {
    if (saving || !questions.length || answers.length !== questions.length) return

    const finalSeconds = Math.max(1, startedAt == null ? 1 : Math.round((Date.now() - startedAt) / 1000))
    setSaving(true)
    setSaveWarning('')

    try {
      await studentLearningRequest('save_quiz', {
        device_token: studentAccess.deviceToken,
        student_token: studentAccess.studentToken,
        student_assignment_id: studentAssignmentId,
        answers,
        duration_seconds: finalSeconds,
      })
      setElapsedSeconds(finalSeconds)
      setScreen('finished')
      if (onSaved) await onSaved()
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Your quest result could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function replayQuest() {
    setQuestionIndex(0)
    setResponse('')
    setAnswers([])
    setChecked(false)
    setStartedAt(Date.now())
    setElapsedSeconds(0)
    setSaveWarning('')
    setScreen('play')
  }

  if (!questions.length) {
    return (
      <div className="quest-backdrop">
        <main className="quest-shell quest-empty">
          <span className="quest-brand">JUANITA QUEST</span>
          <div className="quest-empty-icon">🧭</div>
          <h1>This quest needs checkpoints.</h1>
          <p>Ask a staff member to finish setting up <strong>{assignmentTitle}</strong>.</p>
          <button className="quest-button primary" type="button" onClick={onClose}>Back to My Week</button>
        </main>
      </div>
    )
  }

  return (
    <div className="quest-backdrop">
      <div className="quest-sky-shape one" aria-hidden="true" />
      <div className="quest-sky-shape two" aria-hidden="true" />
      <main className="quest-shell">
        <header className="quest-topbar">
          <div className="quest-logo-lockup">
            <span className="quest-logo-mark">JQ</span>
            <div><strong>Juanita Quest</strong><small>{worldName}</small></div>
          </div>
          <div className="quest-top-actions">
            {screen !== 'intro' && <span className="quest-time" aria-label="Time in quest">⏱ {timeLabel(elapsedSeconds)}</span>}
            <button className="quest-exit" type="button" disabled={saving} onClick={onClose}>Exit</button>
          </div>
        </header>

        {screen === 'intro' ? (
          <section className="quest-intro">
            <div className="quest-world-art" aria-hidden="true">
              <span className="quest-island island-a">⭐</span>
              <span className="quest-island island-b">🔐</span>
              <span className="quest-island island-c">🏁</span>
              <span className="quest-path path-a" />
              <span className="quest-path path-b" />
            </div>
            <div className="quest-intro-copy">
              <span className="quest-kicker">New mission for {studentName.split(' ')[0]}</span>
              <h1>{assignmentTitle}</h1>
              <p>{intro}</p>
              <div className="quest-goal-card">
                <span>🎯</span>
                <div><strong>Your goal</strong><small>{goal}</small></div>
              </div>
              <div className="quest-intro-stats">
                <span><b>{questions.length}</b> checkpoints</span>
                <span><b>⭐</b> stars for effort + accuracy</span>
                <span><b>♻</b> replay anytime</span>
              </div>
              <button className="quest-button primary big" type="button" onClick={startQuest}>Enter {worldName}</button>
            </div>
          </section>
        ) : screen === 'finished' ? (
          <section className="quest-finish">
            <div className="quest-finish-badge">🏆</div>
            <span className="quest-kicker">Mission complete</span>
            <h1>You cleared {worldName}!</h1>
            <p>You finished every checkpoint. Your Learning Hub progress has been saved.</p>

            <div className="quest-results-grid">
              <article><span>⭐</span><strong>{questStars}</strong><small>Quest Stars</small></article>
              <article><span>🎯</span><strong>{correctCount}/{questions.length}</strong><small>Correct</small></article>
              <article><span>🧠</span><strong>{percent.toFixed(0)}%</strong><small>Accuracy</small></article>
            </div>

            <div className={'quest-result-note ' + (percent >= passingScore ? 'goal-met' : 'keep-going')}>
              <strong>{percent >= passingScore ? 'Checkpoint goal reached!' : 'Mission finished — keep building it!'}</strong>
              <span>{percent >= passingScore ? 'Great work. The next quest can bring back older clues to help them stick.' : 'Finishing the mission still counts. Replaying later is a great way to strengthen memory.'}</span>
            </div>

            {saveWarning && <div className="quest-warning">{saveWarning}</div>}
            <div className="quest-finish-actions">
              <button className="quest-button secondary" type="button" onClick={replayQuest}>Replay Quest</button>
              <button className="quest-button primary" type="button" onClick={onClose}>Back to My Week</button>
            </div>
          </section>
        ) : current ? (
          <section className="quest-play">
            <aside className="quest-map-panel">
              <span className="quest-kicker">{worldName}</span>
              <h2>Quest Map</h2>
              <div className="quest-map-list">
                {questions.map((question, index) => {
                  const done = index < answers.length
                  const active = index === questionIndex
                  const correct = answers[index]?.correct
                  return (
                    <div className={(done ? 'done ' : '') + (active ? 'active ' : '') + (done && correct ? 'correct' : '')} key={question.id}>
                      <span>{done ? (correct ? '★' : '✓') : index + 1}</span>
                      <small>{index === questions.length - 1 ? 'Finish' : 'Checkpoint ' + (index + 1)}</small>
                    </div>
                  )
                })}
              </div>
              <div className="quest-star-counter"><span>⭐</span><strong>{questStars}</strong><small>stars earned</small></div>
            </aside>

            <div className="quest-stage">
              <div className="quest-progress-row">
                <div>
                  <span className="quest-kicker">{missionLabel(current)}</span>
                  <strong>Checkpoint {questionIndex + 1} of {questions.length}</strong>
                </div>
                <div className="quest-progress-track"><span style={{ width: ((questionIndex + (checked ? 1 : 0)) / questions.length) * 100 + '%' }} /></div>
              </div>

              <article className="quest-card">
                {current.passage && (
                  <section className="quest-clue">
                    <span>🔎 CLUE FILE</span>
                    <p>{current.passage}</p>
                  </section>
                )}

                <h1>{current.prompt}</h1>

                {choiceQuestion ? (
                  <div className="quest-choices">
                    {(current.choices ?? []).map((choice, index) => {
                      const selected = response === choice
                      const correctChoice = checked && normalize(choice) === normalize(current.correct_answer)
                      const wrongSelected = checked && selected && !correctChoice
                      return (
                        <button
                          className={(selected ? 'selected ' : '') + (correctChoice ? 'correct ' : '') + (wrongSelected ? 'try-again' : '')}
                          type="button"
                          key={choice + index}
                          disabled={checked}
                          onClick={() => setResponse(choice)}
                        >
                          <span className="quest-choice-key">{String.fromCharCode(65 + index)}</span>
                          <span>{choice}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <label className="quest-text-answer">
                    <span>Enter the code</span>
                    <input
                      value={response}
                      disabled={checked}
                      onChange={(event) => setResponse(event.target.value)}
                      placeholder={current.type === 'spelling' ? 'Type the word…' : 'Type your answer…'}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                )}

                {checked && (
                  <div className={'quest-feedback ' + (currentCorrect ? 'correct' : 'try-again')}>
                    <div className="quest-feedback-icon">{currentCorrect ? '⭐' : '💡'}</div>
                    <div>
                      <strong>{currentCorrect ? 'Checkpoint unlocked!' : 'Good try — clue unlocked.'}</strong>
                      {!currentCorrect && <span>The answer is <b>{current.correct_answer}</b>.</span>}
                      {activityConfig?.show_explanations !== false && current.explanation && <p>{current.explanation}</p>}
                    </div>
                  </div>
                )}
              </article>

              <div className="quest-bottom-bar">
                <span>{checked ? (currentCorrect ? '+2 stars: effort + accuracy' : '+1 star for completing the checkpoint') : 'Every checkpoint earns an effort star.'}</span>
                {!checked ? (
                  <button className="quest-button primary" type="button" disabled={!response.trim()} onClick={checkAnswer}>Unlock Checkpoint</button>
                ) : (
                  <button className="quest-button primary" type="button" disabled={saving} onClick={() => void nextQuestion()}>
                    {saving ? 'Saving Quest…' : questionIndex === questions.length - 1 ? 'Finish Mission' : 'Next Checkpoint'}
                  </button>
                )}
              </div>

              {saveWarning && <div className="quest-warning">{saveWarning}</div>}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
