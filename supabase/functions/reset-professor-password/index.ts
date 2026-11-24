import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// كلمة عشوائية من 8 أرقام (مولّد آمن)
function randomPassword(): string {
  const a = new Uint32Array(8)
  crypto.getRandomValues(a)
  return Array.from(a, n => String(n % 10)).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('غير مصرح')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error('غير مصرح')

    // المشرف العام فقط
    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    const isSuper = !!admin && admin.is_active !== false &&
      (admin.role === 'super_admin' || admin.is_super === true)
    if (!isSuper) throw new Error('إعادة تعيين كلمات المرور من صلاحية المشرف العام فقط')

    const { user_id, custom_password } = await req.json()
    if (!user_id) throw new Error('user_id مطلوب')

    // الحساب المستهدف يجب أن يكون حساب أستاذ (لا حساب إدارة)
    const { data: prof } = await supabaseAdmin
      .from('professors')
      .select('id')
      .eq('user_id', user_id)
      .maybeSingle()
    if (!prof) throw new Error('الحساب ليس حساب أستاذ')

    let newPassword: string
    if (custom_password !== undefined && custom_password !== null && String(custom_password).trim() !== '') {
      newPassword = String(custom_password).trim()
      if (newPassword.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل')
    } else {
      newPassword = randomPassword()
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: newPassword,
    })

    if (error) throw new Error(error.message)

    return new Response(
      JSON.stringify({ password: newPassword, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
