'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type CardName = 'diamond' | 'green' | 'yellow' | 'orange' | 'red'

type Entry = {
  id: number
  child_id: number
  entry_date: string
  entry_type: 'behavior' | 'status'
  card: CardName | null
  day_status: string | null
  points: number
  note: string | null
  recorded_by: string
}

type Snapshot = {
  entry_type?: 'behavior' | 'status'
  card?: CardName | null
  day_status?: string | null
  points?: number | string | null
  note?: string | null
}

type AuditRow = {
  id: number
  behavior_entry_id: number
  action: 'created' | 'updated' | 'deleted'
  old_entry: Snapshot | null
  new_entry: Snapshot | null
  changed_by: string | null
  changed_at: string
}

type StaffRow = {
  user_id: string
  display_name: string
}

type Props = {
  entries: Entry[]
  onSaved: () => Promise<void>
}

const cardOptions: { value: CardName; label: string }[] = [
  { value: 'diamond', label: 'Diamond (+2)' },
  { value: 'green', label: 'Green (+1)' },
  { value: 'yellow', label: 'Yellow (-0.5)' },
  { value: 'orange', label: 'Orange (-1)' },
  { value: 'red', label: 'Red (-2)' },
]

const statusOptions = [
  ['absent', 'Absent'],
  ['sick', 'Sick'],
  ['didnt_report', "Didn't Report"],
  ['field_trip', 'Field Trip'],
  ['closed', 'Closed'],
  ['other', 'Other'],
]

function prettyStatus(status: string | null | undefined) {
  if (!status) return 'Status'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function prettyCard(card: CardName | null | undefined) {
  if (!card) return 'Behavior card'
  return `${card.charAt(0).toUpperCase()}${card.slice(1)} card`
}

function formatPoints(points: number | string | null | undefined) {
  const value = Number(points || 0)
  return `${value > 0 ? '+' : ''}${value}`
}

function snapshotLabel(snapshot: Snapshot | null) {
  if (!snapshot) return 'No entry'
  return snapshot.entry_type === 'behavior' ? prettyCard(snapshot.card) : prettyStatus(snapshot.day_status)
}

function describeAudit(row: AuditRow) {
  if (row.action === 'created') return 'Entry created.'
  if (row.action === 'deleted') return 'Entry deleted.'

  const oldEntry = row.old_entry
  const newEntry = row.new_entry
  const changes: string[] = []

  if (
    oldEntry?.entry_type !== newEntry?.entry_type ||
    oldEntry?.card !== newEntry?.card ||
    oldEntry?.day_status !== newEntry?.day_status
  ) {
    changes.push(`${snapshotLabel(oldEntry)} → ${snapshotLabel(newEntry)}`)
  }

  if (Number(oldEntry?.points || 0) !== Number(newEntry?.points || 0)) {
    changes.push(`${formatPoints(oldEntry?.points)} pts → ${formatPoints(newEntry?.points)} pts`)
  }

  const oldNote = (oldEntry?.note ?? '').trim()
  const newNote = (newEntry?.note ?? '').trim()
  if (oldNote !== newNote) {
    if (!oldNote && newNote) changes.push('Note added')
    else if (oldNote && !newNote) changes.push('Note removed')
    else changes.push('Note updated')
  }

  return changes.length ? changes.join(' • ') : 'Entry updated.'
}

export default function HistoryEntryList({ entries, onSaved }: Props) {
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftType, setDraftType] = useState<'behavior' | 'status'>('behavior')
  const [draftCard, setDraftCard] = useState<CardName>('green')
  const [draftStatus, setDraftStatus] = useState('absent')
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const staffNames = useMemo(
    () => new Map(staff.map((person) => [person.user_id, person.display_name])),
    [staff],
  )

  const auditsByEntry = useMemo(() => {
    const grouped = new Map<number, AuditRow[]>()
    for (const audit of audits) {
      const existing = grouped.get(audit.behavior_entry_id) ?? []
      existing.push(audit)
      grouped.set(audit.behavior_entry_id, existing)
    }
    return grouped
  }, [audits])

  useEffect(() => {
    void loadAuditData()
  }, [entries.map((entry) => entry.id).join(',')])

  async function loadAuditData() {
    const entryIds = entries.map((entry) => entry.id)

    const staffRequest = supabase
      .from('staff_profiles')
      .select('user_id, display_name')
      .eq('active', true)
      .order('display_name')

    if (entryIds.length === 0) {
      const { data: staffData } = await staffRequest
      setStaff((staffData ?? []) as StaffRow[])
      setAudits([])
      return
    }

    const [auditResult, staffResult] = await Promise.all([
      supabase
        .from('behavior_entry_audit')
        .select('id, behavior_entry_id, action, old_entry, new_entry, changed_by, changed_at')
        .in('behavior_entry_id', entryIds)
        .order('changed_at', { ascending: false }),
      staffRequest,
    ])

    setAudits((auditResult.data ?? []) as AuditRow[])
    setStaff((staffResult.data ?? []) as StaffRow[])
  }

  function startEditing(entry: Entry) {
    setEditingId(entry.id)
    setDraftType(entry.entry_type)
    setDraftCard(entry.card ?? 'green')
    setDraftStatus(entry.day_status ?? 'absent')
    setDraftNote(entry.note ?? '')
    setErrorMessage('')
  }

  async function saveEdit(entryId: number) {
    setSaving(true)
    setErrorMessage('')

    const updates = draftType === 'behavior'
      ? {
          entry_type: 'behavior' as const,
          card: draftCard,
          day_status: null,
          note: draftNote.trim() || null,
        }
      : {
          entry_type: 'status' as const,
          card: null,
          day_status: draftStatus,
          note: draftNote.trim() || null,
        }

    const { error } = await supabase
      .from('behavior_entries')
      .update(updates)
      .eq('id', entryId)

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setEditingId(null)
    await onSaved()
    await loadAuditData()
    setSaving(false)
  }

  return (
    <div className="history-list">
      {entries.map((entry) => {
        const entryAudits = auditsByEntry.get(entry.id) ?? []
        const isEditing = editingId === entry.id

        return (
          <article className="history-entry" key={entry.id}>
            <div className="history-date">
              <strong>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
              <span className="subtle">{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
            </div>

            <div className="history-body">
              {!isEditing ? (
                <>
                  <div className="history-title-row">
                    <span className={`entry-pill ${entry.card ?? 'status-pill'}`}>
                      {entry.entry_type === 'behavior' ? prettyCard(entry.card) : prettyStatus(entry.day_status)}
                    </span>
                    <strong className={Number(entry.points) < 0 ? 'negative-points' : Number(entry.points) > 0 ? 'positive-points' : ''}>
                      {formatPoints(entry.points)} pts
                    </strong>
                  </div>

                  {entry.note ? <p className="history-note">{entry.note}</p> : <p className="subtle history-note">No note recorded.</p>}

                  <div className="entry-actions">
                    <button className="ghost compact-button" onClick={() => startEditing(entry)}>Edit entry</button>
                  </div>
                </>
              ) : (
                <div className="entry-editor">
                  <div className="editor-grid">
                    <div className="field">
                      <label>Entry type</label>
                      <select value={draftType} onChange={(event) => setDraftType(event.target.value as 'behavior' | 'status')}>
                        <option value="behavior">Behavior card</option>
                        <option value="status">Non-behavior status</option>
                      </select>
                    </div>

                    {draftType === 'behavior' ? (
                      <div className="field">
                        <label>Card</label>
                        <select value={draftCard} onChange={(event) => setDraftCard(event.target.value as CardName)}>
                          {cardOptions.map((card) => <option key={card.value} value={card.value}>{card.label}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="field">
                        <label>Status</label>
                        <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
                          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label>Note</label>
                    <textarea
                      rows={3}
                      value={draftNote}
                      onChange={(event) => setDraftNote(event.target.value)}
                      placeholder="Add context about the card, status, or correction…"
                    />
                  </div>

                  {errorMessage && <div className="notice error">{errorMessage}</div>}

                  <div className="toolbar">
                    <button className="primary" disabled={saving} onClick={() => saveEdit(entry.id)}>{saving ? 'Saving…' : 'Save changes'}</button>
                    <button className="ghost" disabled={saving} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {entryAudits.length > 0 && (
                <details className="audit-trail">
                  <summary>{entryAudits.length} audit {entryAudits.length === 1 ? 'record' : 'records'}</summary>
                  <div className="audit-list">
                    {entryAudits.map((audit) => (
                      <div className="audit-item" key={audit.id}>
                        <strong>{audit.changed_by ? staffNames.get(audit.changed_by) ?? 'Staff member' : 'System'}</strong>
                        <span>{new Date(audit.changed_at).toLocaleString()}</span>
                        <p>{describeAudit(audit)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
