import { supabase } from '@/lib/supabase'

export type StudentAccessContext = {
  deviceToken: string
  studentToken: string
}

export async function studentLearningRequest<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('student-learning', {
    body: { action, ...payload },
  })

  if (error) {
    let message = error.message || 'Student Learning request failed.'
    try {
      const response = (error as any).context
      if (response && typeof response.json === 'function') {
        const body = await response.json()
        if (body?.error) message = body.error
      }
    } catch {}
    throw new Error(message)
  }

  if (data?.error) throw new Error(data.error)
  return data as T
}
