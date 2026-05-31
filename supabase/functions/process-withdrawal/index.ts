
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount, userId, userEmail, paymentMethod, accountDetails } = await req.json();

    if (!amount || amount < 20) {
      return new Response(
        JSON.stringify({ error: "Valor mínimo de levantamento é €20" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId || !accountDetails?.iban || !accountDetails?.accountHolder) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos. IBAN e titular são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar saldo do utilizador
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Perfil não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.balance < amount) {
      return new Response(
        JSON.stringify({ error: "Saldo insuficiente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const description = `Levantamento via Transferência Bancária (IBAN)`;

    // Criar transação pendente
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "withdrawal",
        amount: amount,
        status: "pending",
        payment_method: "bank_transfer",
        description: description,
        account_details: {
          iban: accountDetails.iban,
          accountHolder: accountDetails.accountHolder,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (transactionError) {
      console.error("Erro ao criar transação:", transactionError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar transação" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduzir saldo
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        balance: profile.balance - amount,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (updateError) {
      // Reverter transação se falhar
      await supabase
        .from("transactions")
        .update({ status: "failed" })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({ error: "Erro ao atualizar saldo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactionId: transaction.id,
        message: `Levantamento de €${amount.toFixed(2)} solicitado com sucesso!`,
        processingTime: "1-3 dias úteis",
        newBalance: profile.balance - amount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
