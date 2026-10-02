'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'
import type { QuizConfig, QuizQuestion } from '@/components/QuizActivityRunner'

type QuestQuestion = QuizQuestion & {
  picture?: string
  station_icon?: string
  station_name?: string
  speak_text?: string
  choice_icons?: Record<string, string>
  station_x?: number
  station_y?: number
}

export type JuanitaQuestConfig = QuizConfig & {
  experience?: 'juanita_quest'
  quest_world?: string
  quest_intro?: string
  quest_goal?: string
  quest_level?: 'early_reader' | 'standard'
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

type AvatarOption = {
  id: string
  name: string
  skin: string
  shirt: string
  hair: string
}

type Point = { x: number; y: number }

const avatars: AvatarOption[] = [
  { id: 'sky', name: 'Sky', skin: '#9a673f', shirt: '#3f79e8', hair: '#241b18' },
  { id: 'nova', name: 'Nova', skin: '#c98b61', shirt: '#9a58d8', hair: '#4a2b1f' },
  { id: 'max', name: 'Max', skin: '#6f452d', shirt: '#34a274', hair: '#161413' },
  { id: 'luna', name: 'Luna', skin: '#e0ad82', shirt: '#e46a8f', hair: '#6b3d24' },
]

const defaultStations: Point[] = [
  { x: 18, y: 23 },
  { x: 72, y: 21 },
  { x: 83, y: 55 },
  { x: 58, y: 78 },
  { x: 25, y: 72 },
  { x: 46, y: 48 },
  { x: 12, y: 48 },
  { x: 72, y: 48 },
]

const coinPoints: Point[] = [
  { x: 29, y: 19 }, { x: 43, y: 21 }, { x: 61, y: 19 },
  { x: 76, y: 36 }, { x: 72, y: 67 }, { x: 48, y: 70 },
  { x: 31, y: 61 }, { x: 18, y: 41 }, { x: 46, y: 35 },
]

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function timeLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
}

function BlockAvatar({ avatar, size = 'normal' }: { avatar: AvatarOption; size?: 'normal' | 'small' }) {
  return (
    <span className={'jq-avatar-figure ' + size} aria-hidden="true">
      <span className="jq-avatar-hair" style={{ background: avatar.hair }} />
      <span className="jq-avatar-head" style={{ background: avatar.skin }}>
        <i className="eye left" /><i className="eye right" /><i className="smile" />
      </span>
      <span className="jq-avatar-body" style={{ background: avatar.shirt }} />
      <span className="jq-avatar-leg left" /><span className="jq-avatar-leg right" />
    </span>
  )
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
  const questions = (activityConfig?.questions ?? []) as QuestQuestion[]
  const worldName = activityConfig?.quest_world?.trim() || 'Star Meadow'
  const firstName = studentName.split(' ')[0]
  const [screen, setScreen] = useState<'avatar' | 'world' | 'finished'>('avatar')
  const [avatar, setAvatar] = useState<AvatarOption>(avatars[0])
  const [position, setPosition] = useState<Point>({ x: 48, y: 88 })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'wrong' | 'correct'>('idle')
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [completed, setCompleted] = useState<number[]>([])
  const [coins, setCoins] = useState<number[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  const movementKeys = useRef(new Set<string>())

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('juanita-quest-avatar-' + childId)
      const match = avatars.find((option) => option.id === saved)
      if (match) setAvatar(match)
    } catch {}
  }, [childId])

  const current = questions[currentIndex] ?? null
  const station = current ? {
    x: Number.isFinite(current.station_x) ? Number(current.station_x) : (defaultStations[currentIndex % defaultStations.length]?.x ?? 50),
    y: Number.isFinite(current.station_y) ? Number(current.station_y) : (defaultStations[currentIndex % defaultStations.length]?.y ?? 50),
  } : null
  const nearStation = station ? distance(position, station) < 9 : false
  const correctCount = useMemo(() => answers.filter((answer) => answer.correct).length, [answers])
  const firstTryBonus = correctCount
  const stars = completed.length + firstTryBonus

  useEffect(() => {
    if (startedAt == null || screen === 'finished') return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 500)
    return () => window.clearInterval(timer)
  }, [startedAt, screen])

  useEffect(() => {
    if (screen !== 'world' || challengeOpen) return
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)) {
        event.preventDefault()
        movementKeys.current.add(key)
      }
      if ((key === ' ' || key === 'enter') && nearStation) {
        event.preventDefault()
        openChallenge()
      }
    }
    const up = (event: KeyboardEvent) => movementKeys.current.delete(event.key.toLowerCase())
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)

    const tick = window.setInterval(() => {
      const keys = movementKeys.current
      if (!keys.size) return
      let dx = 0
      let dy = 0
      if (keys.has('arrowup') || keys.has('w')) dy -= 1.8
      if (keys.has('arrowdown') || keys.has('s')) dy += 1.8
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1.8
      if (keys.has('arrowright') || keys.has('d')) dx += 1.8
      if (dx || dy) moveBy(dx, dy)
    }, 55)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.clearInterval(tick)
      movementKeys.current.clear()
    }
  }, [screen, challengeOpen, nearStation, position])

  function speak(text: string) {
    if (!soundOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.82
    utterance.pitch = 1.05
    window.speechSynthesis.speak(utterance)
  }

  function collectNearby(next: Point) {
    setCoins((currentCoins) => {
      const found = coinPoints.flatMap((coin, index) =>
        !currentCoins.includes(index) && distance(next, coin) < 5 ? [index] : []
      )
      return found.length ? [...currentCoins, ...found] : currentCoins
    })
  }

  function moveBy(dx: number, dy: number) {
    setPosition((currentPosition) => {
      const next = {
        x: clamp(currentPosition.x + dx, 7, 93),
        y: clamp(currentPosition.y + dy, 12, 90),
      }
      collectNearby(next)
      return next
    })
  }

  function chooseAvatar(selected: AvatarOption) {
    setAvatar(selected)
    try { window.localStorage.setItem('juanita-quest-avatar-' + childId, selected.id) } catch {}
    speak(selected.name)
  }

  function enterWorld() {
    setStartedAt(Date.now())
    setScreen('world')
    window.setTimeout(() => speak('Walk to the glowing star. Then press play.'), 200)
  }

  function openChallenge() {
    if (!current) return
    setChoice('')
    setFeedback('idle')
    setChallengeOpen(true)
    window.setTimeout(() => speak(current.speak_text || current.prompt), 120)
  }

  function firstRecordedAnswer() {
    return answers.find((answer) => answer.question_id === current?.id)
  }

  function answer(choiceValue: string) {
    if (!current || feedback === 'correct') return
    setChoice(choiceValue)
    const correct = normalize(choiceValue) === normalize(current.correct_answer)
    const existing = firstRecordedAnswer()
    if (!existing) {
      setAnswers((rows) => [...rows, {
        question_id: current.id,
        response: choiceValue,
        correct,
      }])
    }

    if (correct) {
      setFeedback('correct')
      speak('You got it!')
    } else {
      setFeedback('wrong')
      speak('Try again.')
    }
  }

  async function finishStation() {
    if (!current || feedback !== 'correct') return
    const nextCompleted = completed.includes(currentIndex) ? completed : [...completed, currentIndex]
    setCompleted(nextCompleted)
    setChallengeOpen(false)
    setChoice('')
    setFeedback('idle')

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1
      setCurrentIndex(nextIndex)
      const nextQuestion = questions[nextIndex]
      const nextStation = {
        x: Number.isFinite(nextQuestion?.station_x) ? Number(nextQuestion?.station_x) : (defaultStations[nextIndex % defaultStations.length]?.x ?? 50),
        y: Number.isFinite(nextQuestion?.station_y) ? Number(nextQuestion?.station_y) : (defaultStations[nextIndex % defaultStations.length]?.y ?? 50),
      }
      window.setTimeout(() => speak('Great job! Find the next glowing star.'), 150)
      setPosition((pos) => ({ x: clamp(pos.x, 7, 93), y: clamp(pos.y, 12, 90) }))
      return
    }

    await finishQuest(nextCompleted)
  }

  async function finishQuest(finalCompleted: number[]) {
    if (saving || finalCompleted.length !== questions.length) return
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
      speak('Quest complete!')
      if (onSaved) await onSaved()
    } catch (error) {
      setSaveWarning(error instanceof Error ? error.message : 'Your quest could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function replay() {
    setPosition({ x: 48, y: 88 })
    setCurrentIndex(0)
    setChallengeOpen(false)
    setChoice('')
    setFeedback('idle')
    setAnswers([])
    setCompleted([])
    setCoins([])
    setStartedAt(Date.now())
    setElapsedSeconds(0)
    setSaveWarning('')
    setScreen('world')
  }

  if (!questions.length) {
    return (
      <div className="jq-backdrop">
        <main className="jq-empty">
          <div className="jq-logo">JQ</div>
          <h1>This world is not ready yet.</h1>
          <button type="button" className="jq-main-button" onClick={onClose}>Go back</button>
        </main>
      </div>
    )
  }

  if (screen === 'avatar') {
    return (
      <div className="jq-backdrop">
        <main className="jq-game-shell">
          <header className="jq-game-topbar">
            <div className="jq-brand"><span>JQ</span><div><strong>Juanita Quest</strong><small>{worldName}</small></div></div>
            <button type="button" className="jq-top-button" onClick={onClose}>Exit</button>
          </header>
          <section className="jq-avatar-screen">
            <div className="jq-avatar-title">
              <span>WELCOME, {firstName.toUpperCase()}!</span>
              <h1>Choose your hero</h1>
              <p>Pick a character. Then jump into the world.</p>
            </div>
            <div className="jq-avatar-picker">
              {avatars.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={'jq-avatar-card ' + (avatar.id === option.id ? 'selected' : '')}
                  onClick={() => chooseAvatar(option)}
                >
                  <BlockAvatar avatar={option} />
                  <strong>{option.name}</strong>
                  {avatar.id === option.id && <em>✓ READY</em>}
                </button>
              ))}
            </div>
            <div className="jq-avatar-preview">
              <div className="jq-preview-platform"><BlockAvatar avatar={avatar} /></div>
              <div>
                <span>YOUR HERO</span>
                <strong>{avatar.name}</strong>
                <small>Coins: 0 · Stars: 0</small>
              </div>
            </div>
            <button type="button" className="jq-main-button jq-enter" onClick={enterWorld}>PLAY ▶</button>
          </section>
        </main>
      </div>
    )
  }

  if (screen === 'finished') {
    return (
      <div className="jq-backdrop">
        <main className="jq-game-shell">
          <header className="jq-game-topbar">
            <div className="jq-brand"><span>JQ</span><div><strong>Juanita Quest</strong><small>{worldName}</small></div></div>
            <button type="button" className="jq-top-button" onClick={onClose}>Exit</button>
          </header>
          <section className="jq-win-screen">
            <div className="jq-win-trophy">🏆</div>
            <span className="jq-big-kicker">QUEST COMPLETE!</span>
            <h1>Great job, {firstName}!</h1>
            <div className="jq-win-avatar"><BlockAvatar avatar={avatar} /></div>
            <div className="jq-score-cards">
              <article><span>⭐</span><strong>{stars}</strong><small>Stars</small></article>
              <article><span>🪙</span><strong>{coins.length}</strong><small>Coins</small></article>
              <article><span>🎮</span><strong>{completed.length}/{questions.length}</strong><small>Games</small></article>
              <article><span>🎁</span><strong>1</strong><small>Treasure</small></article>
            </div>
            <p className="jq-win-copy">You explored the whole world and finished every game.</p>
            {saveWarning && <div className="jq-save-warning">{saveWarning}</div>}
            <div className="jq-win-actions">
              <button type="button" className="jq-secondary-button" onClick={replay}>Play again</button>
              <button type="button" className="jq-main-button" onClick={onClose}>Back to My Week</button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="jq-backdrop">
      <main className="jq-game-shell jq-world-shell">
        <header className="jq-game-topbar">
          <div className="jq-brand"><span>JQ</span><div><strong>Juanita Quest</strong><small>{worldName}</small></div></div>
          <div className="jq-player-stats">
            <span>⭐ {stars}</span>
            <span>🪙 {coins.length}</span>
            <button type="button" className="jq-sound-button" aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'} onClick={() => setSoundOn((value) => !value)}>{soundOn ? '🔊' : '🔇'}</button>
            <button type="button" className="jq-top-button" disabled={saving} onClick={onClose}>Exit</button>
          </div>
        </header>

        <section className="jq-world">
          <div className="jq-hud-card">
            <BlockAvatar avatar={avatar} size="small" />
            <div>
              <strong>{firstName}</strong>
              <span>Game {currentIndex + 1} of {questions.length}</span>
            </div>
          </div>

          <div className="jq-world-tip">{nearStation ? '⭐ You found a game! Press SPACE or PLAY.' : 'Move to the glowing star ⭐'}</div>

          <div className="jq-sun" aria-hidden="true">☀️</div>
          <div className="jq-cloud cloud-one" aria-hidden="true">☁️</div>
          <div className="jq-cloud cloud-two" aria-hidden="true">☁️</div>
          <div className="jq-pond" aria-hidden="true"><span>🐟</span></div>
          <div className="jq-house" aria-hidden="true"><span>🏠</span></div>
          <div className="jq-tree tree-a" aria-hidden="true">🌳</div>
          <div className="jq-tree tree-b" aria-hidden="true">🌲</div>
          <div className="jq-tree tree-c" aria-hidden="true">🌳</div>
          <div className="jq-tree tree-d" aria-hidden="true">🌲</div>
          <div className="jq-flower flower-a" aria-hidden="true">🌼</div>
          <div className="jq-flower flower-b" aria-hidden="true">🌸</div>
          <div className="jq-npc" aria-hidden="true"><span>🤖</span><small>Quest Bot</small></div>

          {coinPoints.map((coin, index) => !coins.includes(index) && (
            <div key={index} className="jq-coin" style={{ left: coin.x + '%', top: coin.y + '%' }} aria-hidden="true">🪙</div>
          ))}

          {questions.map((question, index) => {
            const point = {
              x: Number.isFinite(question.station_x) ? Number(question.station_x) : (defaultStations[index % defaultStations.length]?.x ?? 50),
              y: Number.isFinite(question.station_y) ? Number(question.station_y) : (defaultStations[index % defaultStations.length]?.y ?? 50),
            }
            const isDone = completed.includes(index)
            const isCurrent = index === currentIndex
            return (
              <div
                key={question.id}
                className={'jq-station ' + (isDone ? 'done ' : '') + (isCurrent ? 'current' : 'locked')}
                style={{ left: point.x + '%', top: point.y + '%' }}
              >
                <div className="jq-station-beam" />
                <span>{isDone ? '✅' : isCurrent ? (question.station_icon || '⭐') : '🔒'}</span>
                <small>{isDone ? 'Done!' : isCurrent ? (question.station_name || 'Game') : 'Locked'}</small>
              </div>
            )
          })}

          <div className="jq-player" style={{ left: position.x + '%', top: position.y + '%' }}>
            <div className="jq-player-shadow" />
            <BlockAvatar avatar={avatar} size="small" />
            <span className="jq-name-tag">{firstName}</span>
          </div>

          <div className="jq-controls" aria-label="Movement controls">
            <button type="button" aria-label="Move up" onClick={() => moveBy(0,-5)}>▲</button>
            <button type="button" aria-label="Move left" onClick={() => moveBy(-5,0)}>◀</button>
            <button type="button" aria-label="Move down" onClick={() => moveBy(0,5)}>▼</button>
            <button type="button" aria-label="Move right" onClick={() => moveBy(5,0)}>▶</button>
          </div>

          {nearStation && (
            <button type="button" className="jq-play-station" onClick={openChallenge}>
              <span>⭐</span> PLAY GAME
            </button>
          )}
        </section>

        {challengeOpen && current && (
          <div className="jq-challenge-layer">
            <section className="jq-challenge-card" role="dialog" aria-modal="true" aria-label="Learning game">
              <header>
                <div><span>{current.station_icon || '⭐'}</span><div><small>{current.station_name || 'Star Game'}</small><strong>Game {currentIndex + 1}</strong></div></div>
                <button type="button" className="jq-listen-button" onClick={() => speak(current.speak_text || current.prompt)}>🔊 Hear it</button>
              </header>

              {current.picture && <div className="jq-picture-prompt" aria-hidden="true">{current.picture}</div>}
              <h2>{current.prompt}</h2>

              <div className="jq-answer-grid">
                {(current.choices ?? []).map((option) => {
                  const isCorrect = normalize(option) === normalize(current.correct_answer)
                  const selected = choice === option
                  return (
                    <div
                      key={option}
                      className={'jq-answer-option ' + (selected ? 'selected ' : '') + (feedback === 'correct' && isCorrect ? 'correct ' : '') + (feedback === 'wrong' && selected ? 'wrong' : '')}
                    >
                      <button type="button" className="jq-answer-choice" onClick={() => answer(option)}>
                        {current.choice_icons?.[option] && <span className="jq-choice-picture">{current.choice_icons[option]}</span>}
                        <strong>{option}</strong>
                      </button>
                      <button
                        type="button"
                        className="jq-choice-speaker"
                        aria-label={'Hear ' + option}
                        onClick={() => speak(option)}
                      >🔊</button>
                    </div>
                  )
                })}
              </div>

              {feedback === 'wrong' && (
                <div className="jq-feedback-box wrong">
                  <span>💛</span><div><strong>Good try!</strong><small>Pick another one.</small></div>
                </div>
              )}
              {feedback === 'correct' && (
                <div className="jq-feedback-box correct">
                  <span>🌟</span><div><strong>You got it!</strong><small>Star unlocked!</small></div>
                </div>
              )}

              <div className="jq-challenge-actions">
                {feedback === 'correct'
                  ? <button type="button" className="jq-main-button" disabled={saving} onClick={() => void finishStation()}>{currentIndex === questions.length - 1 ? 'Finish Quest 🏆' : 'Back to World ▶'}</button>
                  : <button type="button" className="jq-secondary-button" onClick={() => { setChallengeOpen(false); setChoice(''); setFeedback('idle') }}>Walk around</button>}
              </div>
              {saveWarning && <div className="jq-save-warning">{saveWarning}</div>}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
