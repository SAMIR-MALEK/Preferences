import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // التحقق من أن المستدعي مشرف
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('غير مصرح')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // التحقق من هوية المستدعي
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error('غير مصرح')

    // التحقق من أنه مشرف
    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!admin) throw new Error('صلاحيات غير كافية')

    const body = await req.json()
    const {
      last_name, first_name, rank, highest_degree,
      degree_speciality, degree_title, professional_experience,
      email, username_index
    } = body

    if (!last_name || !first_name) throw new Error('اللقب والاسم مطلوبان')

    const username = String(username_index)
    const password = String(Math.floor(1000 + Math.random() * 9000))
    const authEmail = `${username}@wishes.univ-bbm.dz`

    // إنشاء المستخدم في Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
    })

    if (authErr || !authData.user) throw new Error(authErr?.message || 'فشل إنشاء المستخدم')

    // إنشاء سجل الأستاذ
    const { error: profErr } = await supabaseAdmin.from('professors').insert({
      user_id: authData.user.id,
      username,
      last_name,
      first_name,
      rank,
      professional_experience: professional_experience || 0,
      highest_degree: highest_degree || 'دكتوراه',
      degree_speciality: degree_speciality || '',
      degree_title: degree_title || '',
      email: email || '',
    })

    if (profErr) {
      // حذف المستخدم لو فشل إدخال الأستاذ
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw new Error(profErr.message)
    }

    return new Response(
      JSON.stringify({ username, password, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
