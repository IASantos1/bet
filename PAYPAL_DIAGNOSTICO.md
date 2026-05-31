# 🔍 Diagnóstico PayPal - Erro ao Criar Pagamento

## ❌ Erro Atual
```
Error: Erro ao criar pagamento
```

## 🎯 Possíveis Causas

### 1️⃣ **Credenciais Incorretas no Supabase**
As credenciais que guardaste podem estar incorretas ou incompletas.

**Verificar:**
- Vai ao **Supabase Dashboard** → **Edge Functions** → **Secrets**
- Confirma que tens:
  - `PAYPAL_CLIENT_ID` 
  - `PAYPAL_CLIENT_SECRET`

**⚠️ IMPORTANTE:** As credenciais devem ser do ambiente **LIVE** (produção), não SANDBOX!

---

### 2️⃣ **Conta PayPal Não Aprovada para Pagamentos**
Se a tua conta PayPal for nova ou não estiver totalmente verificada, pode não conseguir processar pagamentos.

**Verificar:**
- Vai ao **PayPal Developer Dashboard**
- Verifica se a tua conta está **aprovada** para processar pagamentos
- Confirma que tens **permissões de API** ativas

---

### 3️⃣ **Formato das Credenciais**
As credenciais podem ter espaços ou caracteres especiais que causam problemas.

**Solução:**
1. Copia as credenciais diretamente do PayPal
2. Remove espaços no início/fim
3. Guarda novamente no Supabase

---

### 4️⃣ **Ambiente Sandbox vs Live**
O Client ID que enviaste parece ser de **LIVE**, mas pode estar a usar credenciais de **SANDBOX** no backend.

**Verificar:**
- No código frontend (`CardForm.tsx`), o Client ID é:
  ```
  AZDxjDScFpQtjWTOUtWKbyN_bDt4OgqaF4eYXlewfBP4-8aqX3PiV8e1GWU6liB2CUXlkA59kJXE7M6R
  ```
- No Supabase, as credenciais devem ser do **mesmo ambiente** (LIVE)

---

## 🔧 Como Resolver

### **Passo 1: Verificar Logs da Edge Function**

1. Vai ao **Supabase Dashboard**
2. Clica em **Edge Functions**
3. Seleciona `paypal-create-order`
4. Clica em **Logs**
5. Procura por mensagens de erro detalhadas

Os logs vão mostrar exatamente onde está o problema:
- ❌ Credenciais inválidas
- ❌ Erro de autenticação PayPal
- ❌ Erro ao criar ordem
- ❌ Erro na base de dados

---

### **Passo 2: Testar Credenciais Manualmente**

Podes testar se as credenciais funcionam usando este comando:

```bash
curl -v https://api-m.paypal.com/v1/oauth2/token \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

Substitui `CLIENT_ID` e `CLIENT_SECRET` pelas tuas credenciais.

**Resposta esperada:**
```json
{
  "access_token": "A21AAL...",
  "token_type": "Bearer",
  "expires_in": 32400
}
```

---

### **Passo 3: Verificar Permissões da Conta PayPal**

1. Vai ao **PayPal Developer Dashboard**
2. Clica em **My Apps & Credentials**
3. Seleciona a tua app
4. Verifica se tens estas permissões ativas:
   - ✅ **Accept payments**
   - ✅ **Process payments**
   - ✅ **Refund payments**

---

### **Passo 4: Verificar URL da Edge Function**

No código frontend, a URL é:
```
https://vdpfhovtiaeaynzattjm.supabase.co/functions/v1/paypal-create-order
```

Confirma que esta URL está correta e que a Edge Function está **deployed**.

---

## 📋 Checklist de Verificação

- [ ] Credenciais PayPal guardadas no Supabase
- [ ] Credenciais são do ambiente LIVE (não SANDBOX)
- [ ] Conta PayPal verificada e aprovada
- [ ] Permissões de API ativas
- [ ] Edge Function deployed corretamente
- [ ] Logs da Edge Function verificados
- [ ] URL da Edge Function correta no frontend

---

## 🆘 Próximos Passos

1. **Verifica os logs da Edge Function** no Supabase Dashboard
2. **Copia a mensagem de erro completa** dos logs
3. **Envia-me a mensagem de erro** para eu poder ajudar melhor

---

## 💡 Dica Rápida

Se quiseres testar rapidamente, podes usar as credenciais de **SANDBOX** do PayPal:

1. Vai ao **PayPal Developer Dashboard**
2. Cria uma app de teste
3. Usa as credenciais SANDBOX
4. Testa com contas de teste do PayPal

Depois de funcionar em SANDBOX, mudas para LIVE! 🚀
