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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('غير مصرح')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error('غير مصرح')

    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!admin) throw new Error('صلاحيات غير كافية')

    const { user_id } = await req.json()
    if (!user_id) throw new Error('user_id مطلوب')

    const newPassword = String(Math.floor(1000 + Math.random() * 9000))

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
