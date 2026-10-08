import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.110.9'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

function cleanText(value: unknown, max = 4000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function normalize(value: unknown) {
  return cleanText(value, 4000).replace(/\s+/g, ' ').toLowerCase()
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Student Learning is not configured.' }, 500)

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  let input: any
  try { input = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const action = cleanText(input?.action, 60)

  async function activateDeviceForSignedInStaff(tokenHash: string, label: string) {
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return { ok: false, error: 'A signed-in staff account is required to activate this computer.' }

    const staffClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { error } = await staffClient.rpc('activate_learning_lab_device', {
      p_token_hash: tokenHash,
      p_label: label,
    })

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async function validateDevice(rawToken: string) {
    if (!rawToken) return null

    let device: any = null

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawToken)) {
      const { data } = await db
        .from('learning_lab_devices')
        .select('id,enabled,revoked_at')
        .eq('id', rawToken)
        .maybeSingle()
      device = data
    } else if (rawToken.length >= 32) {
      const tokenHash = await sha256(rawToken)
      const { data } = await db
        .from('learning_lab_devices')
        .select('id,enabled,revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle()
      device = data
    }

    if (!device || !device.enabled || device.revoked_at) return null
    await db.from('learning_lab_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id)
    return device
  }

  async function validateStudent(rawDeviceToken: string, rawStudentToken: string) {
    const device = await validateDevice(rawDeviceToken)
    if (!device || !rawStudentToken || rawStudentToken.length < 32) return null
    const tokenHash = await sha256(rawStudentToken)
    const now = new Date()
    const { data: session } = await db
      .from('learning_student_sessions')
      .select('id,child_id,device_id,expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!session || session.device_id !== device.id || new Date(session.expires_at).getTime() <= now.getTime()) return null
    const [{ data: access }, { data: child }] = await Promise.all([
      db.from('learning_student_access').select('enabled').eq('child_id', session.child_id).maybeSingle(),
      db.from('children').select('id,first_name,last_name,active,is_demo').eq('id', session.child_id).maybeSingle(),
    ])
    if (!access?.enabled || !child?.active) return null
    await db.from('learning_student_sessions').update({ last_seen_at: now.toISOString() }).eq('id', session.id)
    return { session, child }
  }

  async function getAssignment(childId: number, studentAssignmentId: number, expectedType?: string) {
    const { data: row } = await db
      .from('learning_student_assignments')
      .select('id,child_id,assignment_id,week_start,due_date,status')
      .eq('id', studentAssignmentId)
      .eq('child_id', childId)
      .maybeSingle()
    if (!row) return null
    const { data: assignment } = await db
      .from('learning_assignments')
      .select('id,title,subject,assignment_type,skill,estimated_minutes,active,activity_config')
      .eq('id', row.assignment_id)
      .maybeSingle()
    if (!assignment || (expectedType && assignment.assignment_type !== expectedType)) return null
    return { row, assignment }
  }

  if (action === 'provision_device') {
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'A signed-in staff account is required to activate this computer.' }, 401)

    const staffClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const label = cleanText(input?.label, 120) || 'Computer Lab'
    const { data: deviceId, error } = await staffClient.rpc('activate_learning_lab_device_v2', { p_label: label })
    if (error || !deviceId) return json({ error: error?.message || 'This computer could not be activated.' }, 401)

    return json({ ok: true, device_token: String(deviceId), label })
  }

  const rawDeviceToken = cleanText(input?.device_token, 300)

  if (action === 'list_students') {
    const device = await validateDevice(rawDeviceToken)
    if (!device) return json({ error: 'This computer is not activated for Student Learning.' }, 403)

    const { data: accessRows } = await db.from('learning_student_access').select('child_id').eq('enabled', true)
    const childIds = (accessRows ?? []).map((row: any) => Number(row.child_id))
    if (!childIds.length) return json({ students: [] })

    const [{ data: childRows }, { data: registrations }] = await Promise.all([
      db.from('children').select('id,first_name,last_name,active,is_demo').in('id', childIds).eq('active', true).order('first_name').order('last_name'),
      db.from('child_registrations').select('child_id,birth_date,grade,status,registered_at').in('child_id', childIds).not('birth_date', 'is', null).order('registered_at', { ascending: false }),
    ])

    const latest = new Map<number, any>()
    for (const reg of registrations ?? []) if (!latest.has(Number(reg.child_id))) latest.set(Number(reg.child_id), reg)

    const students = (childRows ?? []).flatMap((child: any) => {
      const reg = latest.get(Number(child.id))
      if (!reg?.birth_date) return []
      const lastInitial = cleanText(child.last_name, 120).slice(0, 1)
      return [{
        id: Number(child.id),
        first_name: child.first_name,
        display_name: child.first_name + (lastInitial ? ' ' + lastInitial + '.' : ''),
        grade: reg.grade ?? null,
        is_demo: Boolean(child.is_demo),
      }]
    })
    return json({ students })
  }

  if (action === 'student_login') {
    const device = await validateDevice(rawDeviceToken)
    if (!device) return json({ error: 'This computer is not activated for Student Learning.' }, 403)

    const childId = Number(input?.child_id)
    const pin = cleanText(input?.pin, 10).replace(/\D/g, '')
    if (!Number.isInteger(childId) || pin.length !== 4) return json({ error: 'Choose your name and enter your 4-digit birthday PIN.' }, 400)

    const { data: access } = await db.from('learning_student_access').select('enabled,failed_attempts,locked_until').eq('child_id', childId).maybeSingle()
    if (!access?.enabled) return json({ error: 'Student Learning is not enabled for this profile.' }, 403)
    const now = new Date()
    if (access.locked_until && new Date(access.locked_until).getTime() > now.getTime()) {
      return json({ error: 'Too many incorrect PIN attempts. Ask a staff member or try again in a few minutes.' }, 429)
    }

    const [{ data: child }, { data: registrations }] = await Promise.all([
      db.from('children').select('id,first_name,last_name,active,is_demo').eq('id', childId).maybeSingle(),
      db.from('child_registrations').select('birth_date,grade,status,registered_at').eq('child_id', childId).not('birth_date', 'is', null).order('registered_at', { ascending: false }).limit(1),
    ])
    const reg = registrations?.[0]
    if (!child?.active || !reg?.birth_date) return json({ error: 'This student profile is not ready for Student Learning. Ask a staff member.' }, 403)
    const parts = String(reg.birth_date).split('-')
    const expectedPin = (parts[1] ?? '') + (parts[2] ?? '')

    if (pin !== expectedPin) {
      const attempts = Math.min(20, Number(access.failed_attempts ?? 0) + 1)
      const lock = attempts >= 5 ? new Date(now.getTime() + 5 * 60 * 1000).toISOString() : null
      await db.from('learning_student_access').update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: lock, updated_at: now.toISOString() }).eq('child_id', childId)
      return json({ error: attempts >= 5 ? 'Too many incorrect PIN attempts. Try again in 5 minutes or ask a staff member.' : 'That birthday PIN does not match. Remember: month first, then day.' }, 401)
    }

    const rawStudentToken = randomToken()
    const tokenHash = await sha256(rawStudentToken)
    const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()
    await db.from('learning_student_sessions').delete().lt('expires_at', now.toISOString())
    const { error: sessionError } = await db.from('learning_student_sessions').insert({
      token_hash: tokenHash,
      child_id: childId,
      device_id: device.id,
      expires_at: expiresAt,
    })
    if (sessionError) return json({ error: 'Student Learning could not start. Please try again.' }, 500)

    await db.from('learning_student_access').update({ failed_attempts: 0, locked_until: null, last_login_at: now.toISOString(), updated_at: now.toISOString() }).eq('child_id', childId)
    return json({
      ok: true,
      student_token: rawStudentToken,
      expires_at: expiresAt,
      student: {
        id: childId,
        first_name: child.first_name,
        display_name: child.first_name + (child.last_name ? ' ' + String(child.last_name).slice(0, 1) + '.' : ''),
        grade: reg.grade ?? null,
        is_demo: Boolean(child.is_demo),
      },
    })
  }

  const rawStudentToken = cleanText(input?.student_token, 300)
  const student = await validateStudent(rawDeviceToken, rawStudentToken)
  if (!student) return json({ error: 'Your Student Learning session has ended. Please sign in again.' }, 401)
  const childId = Number(student.session.child_id)

  if (action === 'student_logout') {
    const tokenHash = await sha256(rawStudentToken)
    await db.from('learning_student_sessions').delete().eq('token_hash', tokenHash)
    return json({ ok: true })
  }

  if (action === 'load_week') {
    const weekStart = cleanText(input?.week_start, 20)
    if (!validDate(weekStart)) return json({ error: 'Invalid week.' }, 400)
    const { data: rows, error: rowError } = await db
      .from('learning_student_assignments')
      .select('id,assignment_id,week_start,due_date,schedule_id,occurrence_date,status,score,max_score,minutes_spent,staff_note')
      .eq('child_id', childId)
      .eq('week_start', weekStart)
      .order('id')
    if (rowError) return json({ error: 'Could not load this week.' }, 500)
    const { data: homeworkRows, error: homeworkError } = await db
      .from('learning_homework_tasks')
      .select('id,child_id,week_start,due_date,school_subject,title,details,estimated_minutes,status,student_marked_done_at,staff_verified_at')
      .eq('child_id', childId)
      .eq('week_start', weekStart)
      .order('id')
    if (homeworkError) return json({ error: 'Could not load school homework.' }, 500)
    const assignmentIds = [...new Set((rows ?? []).map((row: any) => Number(row.assignment_id)))]
    const studentAssignmentIds = (rows ?? []).map((row: any) => Number(row.id))
    let assignments: any[] = []
    let writing: any[] = []
    let reading: any[] = []
    if (assignmentIds.length) {
      const { data } = await db.from('learning_assignments')
        .select('id,title,subject,assignment_type,skill,estimated_minutes,activity_config,active')
        .in('id', assignmentIds)
      assignments = data ?? []
    }
    if (studentAssignmentIds.length) {
      const [{ data: writingRows }, { data: readingRows }] = await Promise.all([
        db.from('learning_writing_submissions').select('id,student_assignment_id,status,word_count,active_seconds,staff_feedback,reviewed_at').in('student_assignment_id', studentAssignmentIds),
        db.from('learning_reading_attempts').select('id,student_assignment_id,review_status,objective_correct,objective_count,written_count,review_scores,staff_feedback,created_at').in('student_assignment_id', studentAssignmentIds).order('created_at', { ascending: false }),
      ])
      writing = writingRows ?? []
      const latest = new Map<number, any>()
      for (const row of readingRows ?? []) if (!latest.has(Number(row.student_assignment_id))) latest.set(Number(row.student_assignment_id), row)
      reading = [...latest.values()]
    }
    await Promise.all([
      db.rpc('refresh_learning_goals', { p_child_id: childId }),
      db.rpc('refresh_learning_achievements', { p_child_id: childId }),
    ])
    const [{ data: goalRows }, { data: achievementRows }] = await Promise.all([
      db.from('learning_goals')
        .select('id,goal_type,title,description,start_date,end_date,target_value,target_count,current_value,current_count,reward_points,status,approved_at')
        .eq('child_id', childId)
        .in('status', ['active','reached','approved'])
        .order('created_at', { ascending: false })
        .limit(8),
      db.from('learning_student_achievements')
        .select('id,achievement_key,title,description,icon,unlocked_at')
        .eq('child_id', childId)
        .order('unlocked_at', { ascending: false })
        .limit(8),
    ])
    return json({ student: { id: childId, first_name: student.child.first_name }, rows: rows ?? [], assignments, writing, reading, homework: homeworkRows ?? [], goals: goalRows ?? [], achievements: achievementRows ?? [] })
  }

  if (action === 'mark_homework_done') {
    const homeworkId = Number(input?.homework_id)
    if (!Number.isInteger(homeworkId)) return json({ error: 'Invalid homework task.' }, 400)

    const { data: task } = await db
      .from('learning_homework_tasks')
      .select('id,child_id,status')
      .eq('id', homeworkId)
      .eq('child_id', childId)
      .maybeSingle()

    if (!task) return json({ error: 'That homework task is not available.' }, 404)
    if (task.status === 'completed') return json({ error: 'A staff member has already checked this homework.' }, 409)
    if (task.status === 'awaiting_review') return json({ ok: true })

    const now = new Date().toISOString()
    const { error } = await db.from('learning_homework_tasks').update({
      status: 'awaiting_review',
      student_marked_done_at: now,
      staff_verified_at: null,
      staff_verified_by: null,
      updated_by: null,
      updated_at: now,
    }).eq('id', homeworkId).eq('child_id', childId).eq('status', 'assigned')

    if (error) return json({ error: 'Homework could not be marked finished.' }, 500)
    return json({ ok: true, student_marked_done_at: now })
  }

  if (action === 'load_writing') {
    const studentAssignmentId = Number(input?.student_assignment_id)
    const target = await getAssignment(childId, studentAssignmentId, 'writing')
    if (!target) return json({ error: 'That writing assignment is not available.' }, 404)
    const { data: submission } = await db.from('learning_writing_submissions')
      .select('id,content,status,active_seconds,word_count,staff_feedback,reviewed_at')
      .eq('student_assignment_id', studentAssignmentId)
      .maybeSingle()
    return json({ submission })
  }

  if (action === 'save_typing') {
    const studentAssignmentId = Number(input?.student_assignment_id)
    const target = await getAssignment(childId, studentAssignmentId, 'typing')
    if (!target) return json({ error: 'That typing assignment is not available.' }, 404)
    const p = input?.result ?? {}
    const duration = Math.max(1, Math.min(86400, Math.round(Number(p.duration_seconds) || 1)))
    const accuracy = Math.max(0, Math.min(100, Number(p.accuracy) || 0))
    const wpm = Math.max(0, Math.min(1000, Number(p.wpm) || 0))
    const typedCharacters = Math.max(0, Math.round(Number(p.typed_characters) || 0))
    const correctCharacters = Math.max(0, Math.min(typedCharacters, Math.round(Number(p.correct_characters) || 0)))
    const mode = ['passage','letter_drill','guided_keys','hand_placement'].includes(p.activity_mode) ? p.activity_mode : 'passage'
    const focusKeys = Array.isArray(p.focus_keys) ? p.focus_keys.map((v: unknown) => cleanText(v, 2)).filter((v: string) => v.length <= 1) : []
    const note = cleanText(p.staff_note, 800)
    const now = new Date().toISOString()

    const { error: assignmentError } = await db.from('learning_student_assignments').update({
      status: 'completed', completed_at: now, score: accuracy, max_score: 100,
      minutes_spent: Math.max(1, Math.ceil(duration / 60)), staff_note: note || 'Typing completed by student',
      updated_by: null, updated_at: now, last_updated_source: 'student',
    }).eq('id', studentAssignmentId).eq('child_id', childId)
    if (assignmentError) return json({ error: 'Typing result could not be saved.' }, 500)

    const { error: attemptError } = await db.from('learning_typing_attempts').insert({
      student_assignment_id: studentAssignmentId, child_id: childId, assignment_id: target.row.assignment_id,
      passage_text: cleanText(p.passage_text, 12000) || 'Student typing activity',
      typed_characters: typedCharacters, correct_characters: correctCharacters, wpm, accuracy,
      duration_seconds: duration, completed_by: null, activity_mode: mode, focus_keys: focusKeys,
      mistake_counts: p.mistake_counts && typeof p.mistake_counts === 'object' ? p.mistake_counts : {},
      completion_source: 'student',
    })
    if (attemptError) return json({ error: 'The assignment was completed, but typing history could not be saved.' }, 500)
    return json({ ok: true })
  }

  if (action === 'save_quiz') {
    const studentAssignmentId = Number(input?.student_assignment_id)
    const target = await getAssignment(childId, studentAssignmentId, 'quiz')
    if (!target) return json({ error: 'That quiz is not available.' }, 404)
    const answers = Array.isArray(input?.answers) ? input.answers : []
    const questions = Array.isArray(target.assignment.activity_config?.questions) ? target.assignment.activity_config.questions : []
    const evaluated = questions.map((question: any) => {
      const found = answers.find((answer: any) => String(answer?.question_id) === String(question?.id))
      const response = cleanText(found?.response, 4000)
      return { question_id: String(question?.id ?? ''), response, correct: normalize(response) === normalize(question?.correct_answer) }
    })
    const correctCount = evaluated.filter((answer: any) => answer.correct).length
    const questionCount = Math.max(1, questions.length)
    const percent = Math.round((correctCount / questionCount) * 10000) / 100
    const duration = Math.max(1, Math.min(86400, Math.round(Number(input?.duration_seconds) || 1)))
    const now = new Date().toISOString()
    const note = 'Quiz: ' + correctCount + '/' + questionCount + ' • ' + percent.toFixed(1) + '%'

    const { error: assignmentError } = await db.from('learning_student_assignments').update({
      status: 'completed', completed_at: now, score: correctCount, max_score: questionCount,
      minutes_spent: Math.max(1, Math.ceil(duration / 60)), staff_note: note,
      updated_by: null, updated_at: now, last_updated_source: 'student',
    }).eq('id', studentAssignmentId).eq('child_id', childId)
    if (assignmentError) return json({ error: 'Quiz result could not be saved.' }, 500)

    const { error: attemptError } = await db.from('learning_quiz_attempts').insert({
      student_assignment_id: studentAssignmentId, child_id: childId, assignment_id: target.row.assignment_id,
      answers: evaluated, correct_count: correctCount, question_count: questionCount, percent,
      duration_seconds: duration, completed_by: null, completion_source: 'student',
    })
    if (attemptError) return json({ error: 'The quiz was completed, but attempt history could not be saved.' }, 500)
    return json({ ok: true, correct_count: correctCount, question_count: questionCount, percent })
  }

  if (action === 'save_writing') {
    const studentAssignmentId = Number(input?.student_assignment_id)
    const target = await getAssignment(childId, studentAssignmentId, 'writing')
    if (!target) return json({ error: 'That writing assignment is not available.' }, 404)
    const status = input?.status === 'submitted' ? 'submitted' : 'draft'
    const content = typeof input?.content === 'string' ? input.content.slice(0, 50000) : ''
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
    const activeSeconds = Math.max(0, Math.min(864000, Math.round(Number(input?.active_seconds) || 0)))
    const now = new Date().toISOString()
    const { data: existing } = await db.from('learning_writing_submissions').select('id,status,started_at').eq('student_assignment_id', studentAssignmentId).maybeSingle()
    if (existing?.status === 'reviewed') return json({ error: 'This writing has already been reviewed and is locked.' }, 409)

    let submissionId = existing?.id as number | undefined
    if (submissionId) {
      const { error } = await db.from('learning_writing_submissions').update({
        content, word_count: wordCount, status, active_seconds: activeSeconds,
        submitted_at: status === 'submitted' ? now : null, last_saved_at: now,
        updated_by: null, updated_at: now, last_updated_source: 'student',
      }).eq('id', submissionId)
      if (error) return json({ error: 'Writing could not be saved.' }, 500)
    } else {
      const { data, error } = await db.from('learning_writing_submissions').insert({
        student_assignment_id: studentAssignmentId, child_id: childId, assignment_id: target.row.assignment_id,
        content, word_count: wordCount, status, started_at: cleanText(input?.started_at, 40) || now,
        active_seconds: activeSeconds, submitted_at: status === 'submitted' ? now : null,
        updated_by: null, last_updated_source: 'student',
      }).select('id').single()
      if (error || !data) return json({ error: 'Writing could not be saved.' }, 500)
      submissionId = Number(data.id)
    }

    await db.from('learning_writing_revisions').insert({
      writing_submission_id: submissionId, content, word_count: wordCount, saved_by: null, save_source: 'student',
    })

    const assignmentUpdate = status === 'submitted'
      ? {
          status: 'completed', completed_at: now, score: null, max_score: null,
          minutes_spent: Math.max(1, Math.ceil(Math.max(activeSeconds,1) / 60)),
          staff_note: 'Writing submitted • ' + wordCount + ' words',
          updated_by: null, updated_at: now, last_updated_source: 'student',
        }
      : {
          status: target.row.status === 'assigned' ? 'in_progress' : target.row.status,
          updated_by: null, updated_at: now, last_updated_source: 'student',
        }
    await db.from('learning_student_assignments').update(assignmentUpdate).eq('id', studentAssignmentId).eq('child_id', childId)

    return json({ ok: true, submission: { id: submissionId, content, word_count: wordCount, status, active_seconds: activeSeconds } })
  }

  if (action === 'save_reading') {
    const studentAssignmentId = Number(input?.student_assignment_id)
    const target = await getAssignment(childId, studentAssignmentId, 'reading')
    if (!target) return json({ error: 'That reading assignment is not available.' }, 404)
    const inputAnswers = Array.isArray(input?.answers) ? input.answers : []
    const questions = Array.isArray(target.assignment.activity_config?.questions) ? target.assignment.activity_config.questions : []
    const evaluated = questions.map((question: any) => {
      const found = inputAnswers.find((answer: any) => String(answer?.question_id) === String(question?.id))
      const response = cleanText(found?.response, 8000)
      if (question?.type === 'short_answer') return { question_id: String(question?.id ?? ''), response, correct: null }
      return { question_id: String(question?.id ?? ''), response, correct: normalize(response) === normalize(question?.correct_answer) }
    })
    const objective = evaluated.filter((answer: any) => answer.correct !== null)
    const written = evaluated.filter((answer: any) => answer.correct === null)
    const objectiveCorrect = objective.filter((answer: any) => answer.correct === true).length
    const duration = Math.max(1, Math.min(86400, Math.round(Number(input?.duration_seconds) || 1)))
    const readingSeconds = Math.max(0, Math.min(duration, Math.round(Number(input?.reading_seconds) || 0)))
    const reviewStatus = written.length ? 'pending' : 'not_needed'
    const now = new Date().toISOString()

    const { error: attemptError } = await db.from('learning_reading_attempts').insert({
      student_assignment_id: studentAssignmentId, child_id: childId, assignment_id: target.row.assignment_id,
      answers: evaluated, objective_correct: objectiveCorrect, objective_count: objective.length,
      written_count: written.length, review_status: reviewStatus, reading_seconds: readingSeconds,
      duration_seconds: duration, submitted_at: now, completed_by: null, completion_source: 'student', updated_at: now,
    })
    if (attemptError) return json({ error: 'Reading responses could not be saved.' }, 500)

    const assignmentUpdate: any = {
      status: 'completed', completed_at: now, minutes_spent: Math.max(1, Math.ceil(duration / 60)),
      updated_by: null, updated_at: now, last_updated_source: 'student',
    }
    if (!written.length) {
      assignmentUpdate.score = objectiveCorrect
      assignmentUpdate.max_score = questions.length
      const percent = questions.length ? (objectiveCorrect / questions.length) * 100 : 0
      assignmentUpdate.staff_note = 'Reading comprehension: ' + objectiveCorrect + '/' + questions.length + ' • ' + percent.toFixed(1) + '%'
    } else {
      assignmentUpdate.score = null
      assignmentUpdate.max_score = null
      assignmentUpdate.staff_note = 'Reading submitted • ' + objectiveCorrect + '/' + objective.length + ' objective correct • ' + written.length + ' response' + (written.length === 1 ? '' : 's') + ' awaiting review'
    }
    const { error: assignmentError } = await db.from('learning_student_assignments').update(assignmentUpdate).eq('id', studentAssignmentId).eq('child_id', childId)
    if (assignmentError) return json({ error: 'Reading was saved, but assignment progress could not be updated.' }, 500)
    return json({ ok: true, objective_correct: objectiveCorrect, objective_count: objective.length, written_count: written.length, review_status: reviewStatus })
  }

  return json({ error: 'Unknown Student Learning action.' }, 400)
})
