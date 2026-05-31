# 🔧 Correção do Erro PayPal

## 📋 Problema Identificado

O erro "Erro ao criar pagamento" está a acontecer porque o Edge Function precisa de logs mais detalhados para identificar onde está a falhar.

---

## ✅ Solução

Precisas de fazer o **redeploy** do Edge Function `paypal-create-order` com logs melhorados.

### **Opção 1: Via Supabase Dashboard**

1. Vai ao [Supabase Dashboard - Edge Functions](https://supabase.com/dashboard/project/vdpfhovtiaeaynzattjm/functions)
2. Clica em **paypal-create-order**
3. Substitui o código pelo código abaixo
4. Clica em **Deploy**

### **Opção 2: Via Supabase CLI**

```bash
supabase functions deploy paypal-create-order
```

---

## 📝 Código Corrigido (com logs detalhados)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('🚀 ========== PAYPAL CREATE ORDER ==========');

  try {
    // 1 — Verificar ENV variables
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log('✅ PAYPAL_CLIENT_ID:', paypalClientId ? '✓' : '❌');
    console.log('✅ PAYPAL_CLIENT_SECRET:', paypalClientSecret ? '✓' : '❌');
    console.log('✅ SUPABASE_URL:', supabaseUrl ? '✓' : '❌');
    console.log('✅ SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '❌');

    if (!paypalClientId || !paypalClientSecret || !supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Variáveis de ambiente não configuradas');
      return new Response(
        JSON.stringify({ 
          ok: false,
          error: "Serviço PayPal não configurado. Contacte o suporte.",
          code: "SERVICE_NOT_CONFIGURED"
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2 — Validar autenticação
    const authHeader = req.headers.get('Authorization');
    console.log('🔐 Authorization header:', authHeader ? '✓' : '❌');
    
    if (!authHeader) {
      console.error('❌ Authorization header ausente');
      return new Response(
        JSON.stringify({ ok: false, error: "Não autenticado", code: "MISSING_AUTH" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth error:', authError?.message);
      return new Response(
        JSON.stringify({ ok: false, error: "Sessão inválida. Faça login novamente.", code: "INVALID_SESSION" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Utilizador autenticado:', user.id);

    // 3 — Validar body
    const body = await req.json();
    console.log('📦 Body recebido:', JSON.stringify(body));
    
    const { amount, user_id } = body;

    if (user_id !== user.id) {
      console.error('❌ User ID mismatch:', { expected: user.id, received: user_id });
      return new Response(
        JSON.stringify({ ok: false, error: "Acesso negado", code: "USER_MISMATCH" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!amount || typeof amount !== 'number' || amount < 10 || amount > 10000) {
      console.error('❌ Valor inválido:', amount);
      return new Response(
        JSON.stringify({ 
          ok: false,
          error: amount < 10 ? "Valor mínimo é €10" : "Valor máximo é €10.000",
          code: "INVALID_AMOUNT"
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Valor validado:', amount);

    // 4 — Obter Access Token do PayPal
    console.log('🔑 Obtendo access token PayPal...');
    const authString = btoa(`${paypalClientId}:${paypalClientSecret}`);
    
    const tokenResponse = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    console.log('📡 PayPal token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Erro ao obter token PayPal:', errorText);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Erro de autenticação PayPal. Tente novamente.", 
          code: "PAYPAL_AUTH_ERROR",
          details: errorText 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Access token obtido');

    // 5 — Criar Order no PayPal
    console.log('📦 Criando order PayPal...');
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'EUR',
          value: amount.toFixed(2),
        },
        description: `Depósito BetPT - €${amount.toFixed(2)}`,
      }],
    };
    
    console.log('📤 Order payload:', JSON.stringify(orderPayload));

    const orderResponse = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    console.log('📡 PayPal order response status:', orderResponse.status);

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('❌ Erro ao criar order PayPal:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Erro ao criar pagamento PayPal. Tente novamente.", 
          code: "PAYPAL_ORDER_ERROR",
          details: errorData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orderData = await orderResponse.json();
    console.log('✅ Order criada:', orderData.id);

    // 6 — Guardar transação pendente
    console.log('💾 Guardando transação...');
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id,
        type: "deposit",
        amount,
        status: "pending",
        payment_method: "paypal",
        description: `Depósito PayPal - €${amount.toFixed(2)}`,
        account_details: { paypal_order_id: orderData.id },
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao inserir transação:', insertError);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Erro ao registar transação. Tente novamente.", 
          code: "DB_ERROR",
          details: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Transação guardada:', transaction.id);
    console.log('🎉 ========== SUCESSO ==========');

    return new Response(
      JSON.stringify({
        ok: true,
        order_id: orderData.id,
        transaction_id: transaction.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO:', error.message);
    console.error('Stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: "Erro interno do servidor. Tente novamente.", 
        code: "INTERNAL_ERROR", 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 🔍 Como Ver os Logs

Depois de fazer o deploy:

1. Vai ao [Supabase Dashboard - Logs](https://supabase.com/dashboard/project/vdpfhovtiaeaynzattjm/logs/edge-functions)
2. Seleciona **paypal-create-order**
3. Tenta fazer um depósito novamente
4. Verifica os logs para identificar onde está a falhar

---

## 🎯 O que os logs vão mostrar:

- ✅ Se as credenciais PayPal estão configuradas
- ✅ Se o utilizador está autenticado
- ✅ Se o valor é válido
- ✅ Se o token PayPal foi obtido
- ✅ Se a ordem foi criada
- ✅ Se a transação foi guardada

---

## ⚠️ Possíveis Causas do Erro:

1. **Credenciais PayPal incorretas** - Verifica se o Client ID e Secret estão corretos
2. **Conta PayPal em modo Sandbox** - Certifica-te que estás a usar credenciais de produção
3. **Permissões da conta PayPal** - Verifica se a conta tem permissões para criar orders
4. **Problema de rede** - O PayPal pode estar temporariamente indisponível

---

Depois de fazer o deploy, tenta novamente e envia-me os logs que aparecerem! 🚀
