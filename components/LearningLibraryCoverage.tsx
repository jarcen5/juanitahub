'use client'

import { useMemo, useState } from 'react'
import { learningExpansionPack, getLearningCoverage, type LibraryCoverageAssignment } from '@/lib/learningExpansionPack'
import type { LearningPackAssignment } from '@/lib/learningContentHelpers'

type Props = {
  library: LibraryCoverageAssignment[]
  canInstall: boolean
  isAdmin: boolean
  installing: boolean
  onInstall: () => Promise<void>
  onPreview: (template: LearningPackAssignment, index: number) => void
}

const iconFor: Record<string,string> = {reading:'📖', grammar:'🔤', math:'➗', writing:'✍️', typing:'⌨️'}
const subjectOrder = ['reading','grammar','math','writing','typing']
const levels = ['all','K','1','2','3','4','5','6','7']

export default function LearningLibraryCoverage({ library, canInstall, isAdmin, installing, onInstall, onPreview }: Props) {
  const [grade, setGrade] = useState('all')
  const [subject, setSubject] = useState('all')
  const [galleryOpen, setGalleryOpen] = useState(true)
  const coverage = useMemo(() => getLearningCoverage(library), [library])
  const installed = useMemo(() => new Set(library.map(a => a.title.trim().toLowerCase())), [library])
  const pending = learningExpansionPack.filter(a => !installed.has(a.title.toLowerCase()))
  const shown = learningExpansionPack.map((a,index) => ({a,index}))
    .filter(({a}) => (grade === 'all' || a.grade_levels.includes(grade))
      && (subject === 'all' || a.subject === subject))

  return <section className="card jh-coverage" aria-label="Assignment library coverage and new practice content">
    <div className="jh-coverage-heading">
      <div>
        <span className="learning-kicker">Library growth · Staff review</span>
        <h3>Do we have enough fresh learning activities?</h3>
        <p>Coverage is based on active interactive assignments. This helps identify learning levels that need more variety, especially foundational practice.</p>
      </div>
      <div className="jh-coverage-counts">
        <strong>{library.filter(item=>item.active).length} current</strong>
        <span>{pending.length} new draft{pending.length === 1 ? '' : 's'}</span>
      </div>
    </div>

    <div className="jh-coverage-table-wrap">
      <table className="jh-coverage-table">
        <thead><tr>
          <th scope="col">Level</th>
          {subjectOrder.map(sub => <th key={sub} scope="col"><span aria-hidden="true">{iconFor[sub]}</span> {sub}</th>)}
          <th scope="col">Total</th><th scope="col">Support</th><th scope="col">Rotating quizzes</th><th scope="col">Coverage</th>
        </tr></thead>
        <tbody>{coverage.map(row=><tr key={row.level}>
          <th scope="row">{row.level === 'K' ? 'Kindergarten' : 'Grade '+row.level}</th>
          {row.bySubject.map(col=><td key={col.subject}>{col.count}</td>)}
          <td><strong>{row.count}</strong></td><td>{row.foundational}</td>
          <td>{row.rotating}</td>
          <td><span className={row.low?'jh-coverage-low':'jh-coverage-ok'}>{row.low?'Needs more variety':'Good starting mix'}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="jh-coverage-explain">“Needs more variety” means fewer than 16 independent digital activities or fewer than 5 foundational activities. This is a planning indicator, not a judgment about a student's skills.</p>

    <div className="jh-coverage-pack-heading">
      <div>
        <h4>40 new activities ready for content review</h4>
        <p>Original K–7 practice, including larger question banks and guided writing. Preview the student experience before publishing anything.</p>
      </div>
      <button type="button" className="ghost" aria-expanded={galleryOpen} onClick={()=>setGalleryOpen(value=>!value)}>{galleryOpen?'Hide pack':'Browse pack'}</button>
    </div>
    {galleryOpen&&<>
      <div className="jh-coverage-filters">
        <label>Learning level<select value={grade} onChange={e=>setGrade(e.target.value)}>
          {levels.map(level=><option value={level} key={level}>{level==='all'?'All grades':level==='K'?'Kindergarten':'Grade '+level}</option>)}
        </select></label>
        <label>Subject<select value={subject} onChange={e=>setSubject(e.target.value)}>
          <option value="all">All subjects</option>
          {['reading','grammar','math','writing'].map(s=><option value={s} key={s}>{s}</option>)}
        </select></label>
        <span>{shown.length} to review</span>
      </div>
      <div className="jh-coverage-gallery">
        {shown.map(({a,index})=><article key={a.title} className="jh-coverage-item">
          <span className="jh-coverage-item-icon" aria-hidden="true">{iconFor[a.subject]||'🌟'}</span>
          <div className="jh-coverage-item-copy">
            <strong>{a.title.replace('Fresh Practice · ','')}</strong>
            <small>{a.grade_levels.join(', ')} · {a.subject} · {a.difficulty}
              {a.assignment_type==='quiz' && 'questions' in a.activity_config
                ? ' · '+a.activity_config.questions.length+' in bank / '+a.activity_config.questions_per_attempt+' per attempt'
                : ' · Guided writing'}</small>
            <p>{a.skill}</p>
          </div>
          <div className="jh-coverage-item-actions">
            <button type="button" className="ghost" onClick={()=>onPreview(a,index)}>▶ Test</button>
            <span>{installed.has(a.title.toLowerCase())?'In library':'Draft'}</span>
          </div>
        </article>)}
      </div>
    </>}
    <div className="jh-coverage-publish">
      <div>
        <strong>{pending.length ? pending.length+' reviewed drafts not yet in your library' : 'All pack activities already installed'}</strong>
        <p>Nothing new is created by opening a preview. Installation is available to administrators only after this feature is approved and released to production.</p>
      </div>
      {isAdmin&&<button className="primary" type="button" disabled={!canInstall||installing||!pending.length} onClick={()=>void onInstall()}>
        {installing?'Adding…':!canInstall?'Preview only · No publishing':'Publish '+pending.length+' activities'}
      </button>}
    </div>
  </section>
}
