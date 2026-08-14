'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Child = {
  id: number
  first_name: string
  last_name: string | null
}

type TodayEntry = {
  id: number
  child_id: number
  note: string | null
}

type PortalTarget = {
  childId: number
  element: Element
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function DailyCardNotes() {
  const pathname = usePathname()
  const [children, setChildren] = useState<Child[]>([])
  const [entries, setEntries] = useState<TodayEntry[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [targets, setTargets] = useState<PortalTarget[]>([])
  const notesRef = useRef<Record<number, string>>({})
  const childrenRef = useRef<Child[]>([])
  const today = localDateString()

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    childrenRef.current = children
  }, [children])

  useEffect(() => {
    if (pathname !== '/') {
      setTargets([])
      return
    }

    let mounted = true

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) return

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('active')
        .eq('user_id', userId)
        .maybeSingle()

      if (!profile?.active || !mounted) return

      const [childrenResult, entriesResult] = await Promise.all([
        supabase
          .from('children')
          .select('id, first_name, last_name')
          .eq('active', true)
          .order('first_name')
          .order('last_name'),
        supabase
          .from('behavior_entries')
          .select('id, child_id, note')
          .eq('entry_date', today),
      ])

      if (!mounted) return
      const nextChildren = (childrenResult.data ?? []) as Child[]
      const nextEntries = (entriesResult.data ?? []) as TodayEntry[]
      const entryByChild = new Map(nextEntries.map((entry) => [entry.child_id, entry]))

      setChildren(nextChildren)
      setEntries(nextEntries)
      setNotes((current) => Object.fromEntries(nextChildren.map((child) => [
        child.id,
        current[child.id] ?? entryByChild.get(child.id)?.note ?? '',
      ])))
    }

    void load()
    return () => {
      mounted = false
    }
  }, [pathname, today])

  useEffect(() => {
    if (pathname !== '/' || children.length === 0) return

    let frame = 0

    function locateRows() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const rows = Array.from(document.querySelectorAll('.roster .child-row'))
        const nextTargets: PortalTarget[] = []

        for (let index = 0; index < Math.min(rows.length, children.length); index += 1) {
          const row = rows[index]
          const rightColumn = row.children.item(1) ?? row
          nextTargets.push({ childId: children[index].id, element: rightColumn })
        }

        setTargets((current) => {
          const unchanged = current.length === nextTargets.length && current.every((target, index) => (
            target.childId === nextTargets[index]?.childId && target.element === nextTargets[index]?.element
          ))
          return unchanged ? current : nextTargets
        })
      })
    }

    locateRows()
    const observer = new MutationObserver(locateRows)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname, children])

  const entryByChild = useMemo(
    () => new Map(entries.map((entry) => [entry.child_id, entry])),
    [entries],
  )

  async function refreshEntry(childId: number) {
    const { data } = await supabase
      .from('behavior_entries')
      .select('id, child_id, note')
      .eq('child_id', childId)
      .eq('entry_date', today)
      .maybeSingle()

    if (!data) return null
    const entry = data as TodayEntry
    setEntries((current) => [entry, ...current.filter((item) => item.child_id !== childId)])
    return entry
  }

  async function saveNote(childId: number, showSaving = true) {
    if (showSaving) setSavingId(childId)
    const draft = (notesRef.current[childId] ?? '').trim() || null
    let entry = entryByChild.get(childId) ?? null

    if (!entry) entry = await refreshEntry(childId)

    if (!entry) {
      if (showSaving) setSavingId(null)
      return false
    }

    const { error } = await supabase
      .from('behavior_entries')
      .update({ note: draft })
      .eq('id', entry.id)

    if (!error) {
      setEntries((current) => current.map((item) => (
        item.child_id === childId ? { ...item, note: draft } : item
      )))
    }

    if (showSaving) setSavingId(null)
    return !error
  }

  useEffect(() => {
    if (pathname !== '/' || children.length === 0) return

    async function saveAfterCardAction(childId: number) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await wait(attempt === 0 ? 450 : 250)
        const entry = await refreshEntry(childId)
        if (entry) {
          await saveNote(childId, false)
          return
        }
      }
    }

    function childIdForRow(row: Element) {
      const rows = Array.from(document.querySelectorAll('.roster .child-row'))
      const index = rows.indexOf(row)
      return childrenRef.current[index]?.id ?? null
    }

    function handleClick(event: Event) {
      const target = event.target as Element | null
      if (!target?.closest('button.behavior-button')) return
      const row = target.closest('.child-row')
      if (!row) return
      const childId = childIdForRow(row)
      if (childId) void saveAfterCardAction(childId)
    }

    function handleChange(event: Event) {
      const target = event.target as HTMLSelectElement | null
      if (!target || target.tagName !== 'SELECT' || !target.closest('.behavior-buttons')) return
      if (!target.value) return
      const row = target.closest('.child-row')
      if (!row) return
      const childId = childIdForRow(row)
      if (childId) void saveAfterCardAction(childId)
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('change', handleChange, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('change', handleChange, true)
    }
  }, [pathname, children, today, entryByChild])

  if (pathname !== '/') return null

  return (
    <>
      {targets.map(({ childId, element }) => {
        const child = children.find((item) => item.id === childId)
        const entry = entryByChild.get(childId)
        if (!child) return null

        return createPortal(
          <div
            key={`daily-note-${childId}`}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 9,
              width: '100%',
            }}
          >
            <input
              value={notes[childId] ?? ''}
              onChange={(event) => setNotes((current) => ({ ...current, [childId]: event.target.value }))}
              placeholder="Optional note for today"
              aria-label={`Daily note for ${childName(child)}`}
              style={{
                flex: 1,
                minWidth: 180,
                border: '1px solid #cfd4dc',
                borderRadius: 9,
                padding: '9px 10px',
                background: 'white',
              }}
            />
            <button
              className="ghost compact-button"
              disabled={!entry || savingId === childId}
              onClick={() => void saveNote(childId)}
              title={!entry
                ? 'Type the note, then choose the card or status. It will save with that submission.'
                : 'Save the note without changing today’s card or status.'}
            >
              {savingId === childId ? 'Saving…' : 'Save note'}
            </button>
          </div>,
          element,
          `daily-note-${childId}`,
        )
      })}
    </>
  )
}
