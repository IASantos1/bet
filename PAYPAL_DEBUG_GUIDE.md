# 🔧 Guia de Correção do Erro PayPal

## 📋 Problema Identificado

O erro "Erro ao criar pagamento" está a acontecer na Edge Function `paypal-create-order`. Precisamos de logs detalhados para identificar a causa exata.

---

## ✅ Solução: Redeploy da Edge Function

### **Passo 1: Aceder ao Supabase Dashboard**

1. Vai a: https://supabase.com/dashboard/project/vdpfhovtiaeaynzattjm/functions
2. Clica na função **paypal-create-order**
3. Clica em **Edit Function**

---

### **Passo 2: Substituir o Código**

Apaga todo o código atual e cola este código melhorado:

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
          error: "Serviço PayPal não configurado. Contacta o suporte.",
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
        JSON.stringify({ ok: false, error: "Sessão inválida. Faz login novamente.", code: "INVALID_SESSION" }),
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
    console.log('🔑 A obter access token PayPal...');
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
          error: "Credenciais PayPal inválidas. Verifica a configuração.", 
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
    console.log('📦 A criar order PayPal...');
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
          error: "Erro ao criar pagamento PayPal. Tenta novamente.", 
          code: "PAYPAL_ORDER_ERROR",
          details: errorData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orderData = await orderResponse.json();
    console.log('✅ Order criada:', orderData.id);

    // 6 — Guardar transação pendente
    console.log('💾 A guardar transação...');
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
          error: "Erro ao registar transação. Tenta novamente.", 
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
        error: "Erro interno do servidor. Tenta novamente.", 
        code: "INTERNAL_ERROR", 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

### **Passo 3: Deploy**

1. Clica em **Deploy Function**
2. Aguarda até aparecer "Deployed successfully"

---

### **Passo 4: Verificar os Logs**

1. Vai a: https://supabase.com/dashboard/project/vdpfhovtiaeaynzattjm/logs/edge-functions
2. Seleciona **paypal-create-order** no dropdown
3. Tenta fazer um depósito novamente
4. Verifica os logs que aparecem

---

## 🔍 O que os Logs vão Mostrar

Os logs vão indicar exatamente onde está o problema:

### ✅ **Se tudo estiver OK, verás:**
```
🚀 ========== PAYPAL CREATE ORDER ==========
✅ PAYPAL_CLIENT_ID: ✓
✅ PAYPAL_CLIENT_SECRET: ✓
✅ SUPABASE_URL: ✓
✅ SUPABASE_SERVICE_ROLE_KEY: ✓
🔐 Authorization header: ✓
✅ Utilizador autenticado: [user_id]
📦 Body recebido: {"amount":50,"user_id":"..."}
✅ Valor validado: 50
🔑 A obter access token PayPal...
📡 PayPal token response status: 200
✅ Access token obtido
📦 A criar order PayPal...
📤 Order payload: {...}
📡 PayPal order response status: 201
✅ Order criada: [order_id]
💾 A guardar transação...
✅ Transação guardada: [transaction_id]
🎉 ========== SUCESSO ==========
```

### ❌ **Se houver erro, verás algo como:**

**Erro 1: Credenciais PayPal inválidas**
```
❌ Erro ao obter token PayPal: {"error":"invalid_client"}
```
**Solução:** Verifica se o PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET estão corretos nos Secrets.

**Erro 2: Conta PayPal em Sandbox**
```
❌ Erro ao criar order PayPal: {"name":"PERMISSION_DENIED"}
```
**Solução:** Certifica-te que estás a usar credenciais de **produção** (Live), não Sandbox.

**Erro 3: Problema de autenticação**
```
❌ Auth error: Invalid JWT
```
**Solução:** Faz logout e login novamente.

---

## 🎯 Possíveis Causas do Erro

### 1. **Credenciais PayPal Incorretas**
- Vai a: https://supabase.com/dashboard/project/vdpfhovtiaeaynzattjm/settings/functions
- Verifica se os Secrets estão corretos:
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`

### 2. **Conta PayPal em Modo Sandbox**
- As credenciais que configuraste são de **produção** (Live) ou **sandbox**?
- Para produção, usa: https://developer.paypal.com/dashboard/applications/live
- Para sandbox, usa: https://developer.paypal.com/dashboard/applications/sandbox

### 3. **Permissões da Conta PayPal**
- A tua conta PayPal precisa de ter permissões para:
  - Criar orders
  - Processar pagamentos
  - Aceitar pagamentos com cartão

### 4. **Limite de API do PayPal**
- Verifica se não atingiste o limite de chamadas da API PayPal

---

## 📞 Próximos Passos

1. **Faz o redeploy** da função com o código acima
2. **Tenta fazer um depósito** novamente
3. **Verifica os logs** no Supabase Dashboard
4. **Envia-me os logs** que aparecerem para eu poder ajudar melhor

---

## 🆘 Se Continuares com Problemas

Envia-me:
1. Os logs completos do Supabase
2. Screenshot do erro que aparece
3. Confirma se as credenciais são de produção ou sandbox

---

**Boa sorte! 🚀**
