# Iulian AI – Backend blindat + Frontend

## Ce conține
- Backend Node/Express cu cheia OpenAI **doar în .env** (nu în frontend).
- Sesiune 24h, timeout inactivitate 5 minute, „Reia întrebările”.
- Frontend simplu care cheamă **/api** (nu OpenAI direct).

## Setup rapid
1. Instalează Node 18+.
2. În directorul proiectului:
   ```bash
   npm install
   cp .env.example .env
   # editează .env cu cheia și assistant_id-ul tău
   npm start
   ```
3. Deschide http://localhost:3000/

## Deploy rapid (Render)
- Creezi un nou Web Service din repo sau arhivă.
- Setezi variabilele de mediu:
  - OPENAI_API_KEY = sk-svcacct-... (cheia ta)
  - ASSISTANT_ID = asst_... (assistantul tău)
  - PORT = 10000 (Render îl setează singur, dar e ok să lași implicit)
- Comanda start: `npm start`

## Notă
- Stocarea sesiunilor e in-memory (ephemeral). Pentru producție, folosește Redis/DB.
