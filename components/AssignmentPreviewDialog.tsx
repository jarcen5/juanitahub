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
  activity_config?: {
    mode?: 'passage' | 'letter_drill' | 'guided_keys' | 'hand_placement'
    passage?: string
    focus_keys?: string[]
    target_keystrokes?: number
    target_wpm?: number
    target_accuracy?: number
    questions?: Array<{
      id: string
      type: 'multiple_choice' | 'correct_sentence' | 'fill_blank' | 'spelling' | 'reading_comprehension' | 'main_idea' | 'detail' | 'vocabulary' | 'short_answer'
      prompt: string
      choices?: string[]
      correct_answer?: string
      explanation?: string
      passage?: string
    }>
    passing_score?: number
    show_explanations?: boolean
    writing_mode?: 'journal' | 'short_response' | 'paragraph' | 'creative' | 'reading_response'
    prompt?: string
    sentence_starters?: string[]
    min_words?: number
    target_words?: number
    rubric_criteria?: string[]
  }
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
  general: 'Special',
}

const subjectIcons: Record<PreviewAssignment['subject'], string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '🌟',
}

function formatLabel(value: PreviewAssignment['delivery_format']) {
  if (value === 'either') return 'Digital or printable'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function typeLabel(value: PreviewAssignment['assignment_type']) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const typingModeLabels = {
  passage: 'Passage Practice',
  letter_drill: 'Letter Practice',
  guided_keys: 'Guided Keys',
  hand_placement: 'Hand Placement',
} as const

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

            {assignment.assignment_type === 'typing' && (
              <div className="learning-preview-typing">
                <div>
                  <strong>{typingModeLabels[assignment.activity_config?.mode ?? 'passage']}</strong>
                  <span>{(assignment.activity_config?.mode ?? 'passage') === 'passage' ? (assignment.activity_config?.passage?.length ?? 0) + ' characters' : (assignment.activity_config?.target_keystrokes ?? 30) + ' correct keys'}</span>
                </div>

                {(assignment.activity_config?.mode ?? 'passage') === 'passage' ? (
                  <p>{assignment.activity_config?.passage || 'No passage has been added yet.'}</p>
                ) : (
                  <>
                    <div className="learning-preview-focus-keys">
                      {(assignment.activity_config?.focus_keys ?? []).map((key) => <span key={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}</span>)}
                    </div>
                    {assignment.activity_config?.mode === 'letter_drill' && <p>The student will type a repeated drill made only from the selected keys.</p>}
                    {assignment.activity_config?.mode === 'guided_keys' && <p>Juanita Hub will highlight one key at a time and wait for the correct key before moving on.</p>}
                    {assignment.activity_config?.mode === 'hand_placement' && <p>The student will see a home-row guide, highlighted target keys, and the correct finger for each key.</p>}
                  </>
                )}

                <div className="learning-preview-typing-goals">
                  {typeof assignment.activity_config?.target_wpm === 'number' && <span>⌨️ Goal: {assignment.activity_config.target_wpm} WPM</span>}
                  {typeof assignment.activity_config?.target_accuracy === 'number' && <span>🎯 Goal: {assignment.activity_config.target_accuracy}% accuracy</span>}
                </div>
              </div>
            )}

            {assignment.assignment_type === 'quiz' && (
              <div className="learning-preview-quiz">
                <div className="learning-preview-quiz-heading">
                  <strong>Quiz setup</strong>
                  <span>{assignment.activity_config?.questions?.length ?? 0} questions • Goal {assignment.activity_config?.passing_score ?? 80}%</span>
                </div>
                <div className="learning-preview-quiz-list">
                  {(assignment.activity_config?.questions ?? []).map((question, index) => (
                    <article key={question.id}>
                      <span>Question {index + 1}</span>
                      {question.passage && <p className="reading">{question.passage}</p>}
                      <strong>{question.prompt}</strong>
                      {question.choices && question.choices.length > 0 && <div>{question.choices.map((choice) => <small key={choice} className={choice.trim().toLowerCase() === (question.correct_answer ?? '').trim().toLowerCase() ? 'correct' : ''}>{choice}</small>)}</div>}
                      {(!question.choices || question.choices.length === 0) && <small className="correct">Answer: {question.correct_answer || 'No answer added.'}</small>}
                      {question.explanation && <p>{question.explanation}</p>}
                    </article>
                  ))}
                  {(assignment.activity_config?.questions?.length ?? 0) === 0 && <p>No quiz questions have been added yet.</p>}
                </div>
              </div>
            )}

            {assignment.assignment_type === 'writing' && (
              <div className="learning-preview-writing">
                <div>
                  <strong>Writing Lab</strong>
                  <span>{assignment.activity_config?.writing_mode?.replaceAll('_', ' ') ?? 'writing prompt'}</span>
                </div>
                <section>
                  <span>Prompt</span>
                  <p>{assignment.activity_config?.prompt || 'No writing prompt has been added yet.'}</p>
                </section>
                {(assignment.activity_config?.sentence_starters?.length ?? 0) > 0 && <div className="learning-preview-writing-starters">{assignment.activity_config?.sentence_starters?.map((starter) => <small key={starter}>{starter}</small>)}</div>}
                <div className="learning-preview-writing-meta">
                  {typeof assignment.activity_config?.min_words === 'number' && <span>Minimum {assignment.activity_config.min_words} words</span>}
                  {typeof assignment.activity_config?.target_words === 'number' && <span>Target {assignment.activity_config.target_words} words</span>}
                  {(assignment.activity_config?.rubric_criteria?.length ?? 0) > 0 && <span>{assignment.activity_config?.rubric_criteria?.length} review areas</span>}
                </div>
              </div>
            )}

            {assignment.assignment_type === 'reading' && (
              <div className="learning-preview-reading">
                <div className="learning-preview-reading-heading">
                  <strong>Reading Comprehension Lab</strong>
                  <span>{assignment.activity_config?.questions?.length ?? 0} questions • Goal {assignment.activity_config?.passing_score ?? 80}%</span>
                </div>
                <section className="learning-preview-reading-passage">
                  <span>Passage</span>
                  <p>{assignment.activity_config?.passage || 'No passage has been added yet.'}</p>
                </section>
                <div className="learning-preview-reading-list">
                  {(assignment.activity_config?.questions ?? []).map((question, index) => (
                    <article key={question.id}>
                      <span>Question {index + 1} • {question.type.replaceAll('_', ' ')}</span>
                      <strong>{question.prompt}</strong>
                      {question.type === 'short_answer'
                        ? <small className="guidance">Staff guidance: {question.correct_answer || 'No guidance added.'}</small>
                        : <>
                            {question.choices && question.choices.length > 0 && <div>{question.choices.map((choice) => <small key={choice} className={choice.trim().toLowerCase() === (question.correct_answer ?? '').trim().toLowerCase() ? 'correct' : ''}>{choice}</small>)}</div>}
                            {question.explanation && <p>{question.explanation}</p>}
                          </>}
                    </article>
                  ))}
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
