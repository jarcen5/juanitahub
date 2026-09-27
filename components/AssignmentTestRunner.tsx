'use client'

import { useState } from 'react'
import TypingActivityRunner from '@/components/TypingActivityRunner'

type TestAssignment = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  instructions: string | null
  resource_url: string | null
  activity_config: {
    mode?: 'passage' | 'letter_drill' | 'guided_keys' | 'hand_placement'
    passage?: string
    focus_keys?: string[]
    target_keystrokes?: number
    target_wpm?: number
    target_accuracy?: number
  }
}

type Props = {
  assignment: TestAssignment | null
  onClose: () => void
}

const subjectLabels: Record<TestAssignment['subject'], string> = {
  reading: 'Reading',
  writing: 'Writing',
  grammar: 'Grammar',
  typing: 'Typing',
  math: 'Math',
  general: 'General',
}

export default function AssignmentTestRunner({ assignment, onClose }: Props) {
  const [completed, setCompleted] = useState(false)

  if (!assignment) return null

  if (assignment.assignment_type === 'typing') {
    return (
      <TypingActivityRunner
        assignmentTitle={assignment.title}
        studentName="Staff Test"
        activityConfig={assignment.activity_config}
        testMode
        onClose={onClose}
      />
    )
  }

  return (
    <div className="assignment-test-backdrop">
      <main className="assignment-test-shell">
        <div className="assignment-test-banner">
          <strong>TEST MODE</strong>
          <span>Student simulation only. Nothing is assigned, completed, scored, or saved.</span>
        </div>

        <header className="assignment-test-topbar">
          <div>
            <span className="learning-kicker">Juanita Hub Learning</span>
            <strong>Student view simulation</strong>
          </div>
          <button className="ghost" type="button" onClick={onClose}>Exit test</button>
        </header>

        <section className="assignment-test-content">
          {!completed ? (
            <>
              <div className="assignment-test-icon">{assignment.subject === 'reading' ? '📖' : assignment.subject === 'writing' ? '✍️' : assignment.subject === 'grammar' ? '🔤' : assignment.subject === 'math' ? '➗' : '📘'}</div>
              <span className="learning-kicker">{subjectLabels[assignment.subject]} • {assignment.skill || 'General skill'}</span>
              <h1>{assignment.title}</h1>
              <section className="assignment-test-card">
                <span className="learning-kicker">Your assignment</span>
                <h2>What to do</h2>
                <p>{assignment.instructions || 'Your staff member will give you the directions for this activity.'}</p>

                {assignment.resource_url ? (
                  <a className="primary assignment-test-resource" href={assignment.resource_url} target="_blank" rel="noreferrer">Open assignment resource ↗</a>
                ) : (
                  <div className="assignment-test-placeholder">
                    <strong>No interactive activity is attached yet.</strong>
                    <span>This assignment currently uses staff directions, discussion, writing, reading, or a separate printable/resource. Future digital activity engines can plug into this same test screen.</span>
                  </div>
                )}
              </section>

              <div className="assignment-test-actions">
                <button className="ghost" type="button" onClick={onClose}>Exit test</button>
                <button className="primary" type="button" onClick={() => setCompleted(true)}>Simulate completion</button>
              </div>
            </>
          ) : (
            <section className="assignment-test-finished">
              <span>✓</span>
              <span className="learning-kicker">Test complete</span>
              <h1>{assignment.title}</h1>
              <p>This is only a simulation. No student record, assignment status, score, or progress was changed.</p>
              <div>
                <button className="ghost" type="button" onClick={() => setCompleted(false)}>Test again</button>
                <button className="primary" type="button" onClick={onClose}>Done</button>
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  )
}
