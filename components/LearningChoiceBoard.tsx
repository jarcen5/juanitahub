'use client'

import { useState } from 'react'

export type ChoiceActivity = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: string
  skill: string | null
  estimated_minutes: number | null
}
export type ChoiceBoardData = {
  enabled: boolean
  weekly_limit: number
  used: number
  remaining: number
  learning_level: string | null
  choices: ChoiceActivity[]
}
type Props = {
  board: ChoiceBoardData
  onChoose?: (assignmentId: number) => Promise<void>
  preview?: boolean
}

const icons: Record<ChoiceActivity['subject'], string> = {
  reading: '📚', writing: '✏️', grammar: '🔤', typing: '⌨️', math: '🧮', general: '🌟',
}
const typeNames: Record<string, string> = {
  typing:'Typing', quiz:'Quiz', reading:'Reading practice', writing:'Writing practice',
}

export default function LearningChoiceBoard({ board, onChoose, preview = false }: Props) {
  const [workingId,setWorkingId] = useState<number | null>(null)
  const [notice,setNotice] = useState('')
  if (!board.enabled) return null

  async function choose(id: number) {
    if (!onChoose || workingId != null || preview || board.remaining <= 0) return
    setWorkingId(id)
    setNotice('')
    try {
      await onChoose(id)
      setNotice('Added! Find your activity under My Choices below. 🌟')
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'Could not add that activity. Ask a staff member.')
    } finally { setWorkingId(null) }
  }

  return <section className="jh-choiceboard" aria-label="Staff-approved student activity choices">
    <header className="jh-choiceboard-heading">
      <div className="jh-choiceboard-title">
        <span className="jh-choiceboard-mascot" aria-hidden="true">🌈</span>
        <div>
          <span className="jh-choiceboard-eyebrow">Staff-approved activities</span>
          <h2>Choose an Activity!</h2>
          <p>Done with your work, or want to practice more? Pick something you like.</p>
        </div>
      </div>
      <div className="jh-choiceboard-counter">
        <strong>{board.remaining}</strong>
        <span>{board.remaining === 1 ? 'choice left' : 'choices left'} this week</span>
      </div>
    </header>
    {notice && <p className="jh-choiceboard-notice" role="status" aria-live="polite">{notice}</p>}
    {board.remaining <= 0 ? (
      <div className="jh-choiceboard-empty">
        <span aria-hidden="true">🏅</span>
        <strong>You made your choices for this week!</strong>
        <p>Great job trying something new. You can still finish or replay your activities below.</p>
      </div>
    ) : !board.learning_level ? (
      <div className="jh-choiceboard-empty">
        <span aria-hidden="true">🧩</span>
        <strong>Ask staff for your learning level.</strong>
        <p>Then your choices will appear here.</p>
      </div>
    ) : board.choices.length === 0 ? (
      <div className="jh-choiceboard-empty">
        <span aria-hidden="true">🌱</span>
        <strong>New activities are coming!</strong>
        <p>Ask staff to add more choices for your learning level.</p>
      </div>
    ) : (
      <div className="jh-choiceboard-grid">
        {board.choices.slice(0, 12).map(activity => <article key={activity.id} className="jh-choiceboard-card">
          <span className="jh-choiceboard-card-icon" aria-hidden="true">{icons[activity.subject] ?? '🌟'}</span>
          <div>
            <span className="jh-choiceboard-type">{typeNames[activity.assignment_type] ?? 'Practice'}{activity.estimated_minutes ? ' · '+activity.estimated_minutes+' min' : ''}</span>
            <h3>{activity.title}</h3>
            <p>{activity.skill || 'Have fun learning something new!'}</p>
          </div>
          <button type="button" disabled={preview || workingId !== null} onClick={() => void choose(activity.id)}>
            {preview ? 'Staff preview' : workingId === activity.id ? 'Adding…' : 'Add to My Week +'}
          </button>
        </article>)}
      </div>
    )}
    <footer className="jh-choiceboard-foot">
      <span>💛 Your scheduled work and school homework stay on your list.</span>
      {preview && <strong>Preview only · No student records changed</strong>}
    </footer>
  </section>
}
