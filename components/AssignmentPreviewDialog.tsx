'use client'

type PreviewAssignment = {
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  grade_levels: string[]
  difficulty: 'support' | 'standard' | 'challenge'
  delivery_format: 'digital' | 'printable' | 'either'
  instructions: string | null
  estimated_minutes: number | null
  resource_url: string | null
  activity_config?: { passage?: string; target_wpm?: number; target_accuracy?: number }
}

type Props = {
  assignment: PreviewAssignment | null
  onClose: () => void
}

const subjectLabels: Record<PreviewAssignment['subject'], string> = {
  reading: 'Reading',
  writing: 'Writing',
  grammar: 'Grammar',
  typing: 'Typing',
  math: 'Math',
  general: 'General',
}

const subjectIcons: Record<PreviewAssignment['subject'], string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '📘',
}

function formatLabel(value: PreviewAssignment['delivery_format']) {
  if (value === 'either') return 'Digital or printable'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function typeLabel(value: PreviewAssignment['assignment_type']) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function AssignmentPreviewDialog({ assignment, onClose }: Props) {
  if (!assignment) return null

  return (
    <div className="learning-preview-backdrop" role="presentation" onClick={onClose}>
      <section className="learning-preview-shell" role="dialog" aria-modal="true" aria-labelledby="learning-preview-title" onClick={(event) => event.stopPropagation()}>
        <header className="learning-preview-toolbar">
          <div>
            <span className="learning-kicker">Staff preview</span>
            <strong>What the student will see</strong>
          </div>
          <button className="ghost" type="button" onClick={onClose}>Close preview</button>
        </header>

        <article className="learning-student-preview">
          <div className="learning-student-preview-brand">
            <span>Juanita Hub</span>
            <small>Learning</small>
          </div>

          <div className="learning-student-preview-icon">{subjectIcons[assignment.subject]}</div>
          <span className="learning-student-preview-subject">{subjectLabels[assignment.subject]}</span>
          <h1 id="learning-preview-title">{assignment.title}</h1>

          <div className="learning-student-preview-tags">
            <span>{assignment.skill || 'General skill'}</span>
            <span>{typeLabel(assignment.assignment_type)}</span>
            <span>{formatLabel(assignment.delivery_format)}</span>
            <span>{assignment.difficulty.charAt(0).toUpperCase() + assignment.difficulty.slice(1)}</span>
            <span>{assignment.grade_levels.length ? 'Grades ' + assignment.grade_levels.join(', ') : 'All grades'}</span>
            {assignment.estimated_minutes != null && <span>About {assignment.estimated_minutes} min</span>}
          </div>

          <section className="learning-student-preview-card">
            <span className="learning-kicker">Your assignment</span>
            <h2>What to do</h2>
            <p>{assignment.instructions || 'Your staff member will give you the directions for this activity.'}</p>

            {assignment.assignment_type === 'typing' && assignment.activity_config?.passage && (
              <div className="learning-preview-typing">
                <div><strong>Typing passage</strong><span>{assignment.activity_config.passage.length} characters</span></div>
                <p>{assignment.activity_config.passage}</p>
                <div className="learning-preview-typing-goals">
                  {typeof assignment.activity_config.target_wpm === 'number' && <span>⌨️ Goal: {assignment.activity_config.target_wpm} WPM</span>}
                  {typeof assignment.activity_config.target_accuracy === 'number' && <span>🎯 Goal: {assignment.activity_config.target_accuracy}% accuracy</span>}
                </div>
              </div>
            )}

            {assignment.resource_url ? (
              <a className="primary learning-preview-resource" href={assignment.resource_url} target="_blank" rel="noreferrer">Open assignment resource ↗</a>
            ) : assignment.assignment_type !== 'typing' ? (
              <div className="learning-preview-resource-empty">
                <strong>No digital resource attached</strong>
                <span>This activity will use the instructions above, a staff-provided activity, or a printable handout.</span>
              </div>
            ) : null}
          </section>

          <div className="learning-student-preview-note">
            <span>👀</span>
            <p>This is a read-only preview. Nothing is assigned or recorded while you are viewing it.</p>
          </div>
        </article>
      </section>
    </div>
  )
}
