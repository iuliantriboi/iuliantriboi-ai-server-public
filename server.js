// server.js — versiune fixată

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// CORS
const ALLOWED_ORIGIN = (process.env.CORS_ORIGIN || "https://iuliantriboi.carrd.co").trim();
app.use(cors({ origin: ALLOWED_ORIGIN }));

app.use(bodyParser.json());
app.use(express.static("public"));

// Chei ENV (TAIEM spațiile/newline-urile!)
const OPENAI_KEY   = (process.env.OPENAI_API_KEY || "").trim();
const ASSISTANT_ID = (process.env.ASSISTANT_ID   || "").trim();
const PORT = process.env.PORT || 3000;

if (!OPENAI_KEY || !ASSISTANT_ID) {
  console.error("Lipsește OPENAI_API_KEY sau ASSISTANT_ID în Environment.");
  process.exit(1);
}

// sesiuni in-memorie
const SESSIONS = new Map();
const now = () => Date.now();

function newSession({ questions = 10, tokenBudget = 30000 }) {
  const id = Math.random().toString(36).slice(2);
  const s = {
    id,
    createdAt: now(),
    lastActivity: now(),
    remainingQuestions: questions,
    remainingTokens: tokenBudget,
    closed: false,
  };
  SESSIONS.set(id, s);
  return s;
}

const getSession = (id) => SESSIONS.get(id) || null;

// API
app.post("/api/session/start", (req, res) => {
  const s = newSession({ questions: 10, tokenBudget: 30000 });
  res.json({
    sessionId: s.id,
    remainingQuestions: s.remainingQuestions,
    remainingTokens: s.remainingTokens,
  });
});

app.post("/api/session/resume", (req, res) => {
  const { sessionId } = req.body || {};
  const s = getSession(sessionId);
  if (!s) return res.status(404).json({ error: "Sesiune inexistentă." });

  if (s.closed) {
    if (s.remainingQuestions > 0 && s.remainingTokens > 0) {
      s.closed = false;
      s.lastActivity = now();
      return res.json({
        ok: true,
        remainingQuestions: s.remainingQuestions,
        remainingTokens: s.remainingTokens,
      });
    }
    return res
      .status(403)
      .json({ error: "Limită atinsă. Donează din nou. (Repornește.)" });
  }

  res.json({
    ok: true,
    remainingQuestions: s.remainingQuestions,
    remainingTokens: s.remainingTokens,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, prompt } = req.body || {};
    if (!prompt || !prompt.trim())
      return res.status(400).json({ error: "Prompt gol." });

    const s = getSession(sessionId);
    if (!s) return res.status(404).json({ error: "Sesiune inexistentă." });
    if (s.closed)
      return res
        .status(403)
        .json({ error: "Sesiune închisă. Apasă „Reia întrebările”." });
    if (s.remainingQuestions <= 0 || s.remainingTokens <= 0)
      return res
        .status(403)
        .json({ error: "Limită atinsă. Donează din nou. (Repornește.)" });

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`, // <- cu .trim() rezolvă invalid header
      "OpenAI-Beta": "assistants=v2",
    };

    // 1) thread
    const tRes = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers,
    });
    const thread = await tRes.json();
    if (!thread.id) throw new Error("Nu pot crea thread.");

    // 2) mesaj user
    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role: "user", content: prompt }),
    });

    // 3) rulare assistant
    const runRes = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ assistant_id: ASSISTANT_ID }),
    });
    const run = await runRes.json();

    let status = run.status;
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1200));
      const c = await fetch(
        `https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`,
        { headers }
      );
      const cd = await c.json();
      status = cd.status;
    }
    if (status !== "completed") throw new Error("Rularea assistant-ului a eșuat.");

    // 4) citim răspunsul
    const mRes = await fetch(
      `https://api.openai.com/v1/threads/${thread.id}/messages`,
      { headers }
    );
    const data = await mRes.json();
    const assistantMessage = (data.data || []).find((m) => m.role === "assistant");
    const replyRaw = assistantMessage?.content?.[0]?.text?.value || "[Mesaj gol]";

    // curățăm citările ciudate
    const cleanReply = replyRaw
      .replace(/【.*?】/g, "")
      .replace(/†/g, "")
      .replace(/\[(\d+|note|ref).*?\]/gi, "")
      .trim();

    // scădem “bugetul”
    const roughTokens = Math.ceil((prompt.length + replyRaw.length) / 4);
    s.remainingTokens = Math.max(0, s.remainingTokens - roughTokens);
    s.remainingQuestions -= 1;
    s.closed = true;
    s.lastActivity = now();

    // răspuns
    res.json({
      reply: cleanReply,
      remainingQuestions: s.remainingQuestions,
      remainingTokens: s.remainingTokens,
      sessionId: s.id,
      sessionClosed: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Eroare server." });
  }
});

// health check pentru Render
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// start
app.listen(PORT, () => {
  console.log("Server online pe port", PORT);
});
