import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const providers = {
  gemini: {
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
  },

  nvidia: {
    name: "NVIDIA",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: process.env.NVIDIA_API_KEY,
    model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct"
  },

  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  },

  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "openrouter/auto"
  }
};

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "VISHU AI",
    configuredProviders: Object.keys(providers).filter(
      key => Boolean(providers[key].key)
    )
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, model = "auto" } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    if (message.length > 12000) {
      return res.status(400).json({
        error: "Message is too long."
      });
    }

    let providerId = model;

    if (providerId === "auto") {
      providerId = Object.keys(providers).find(
        key => Boolean(providers[key].key)
      );
    }

    /*
      Claude and OpenAI require their own API formats.
      Don't silently route them to another provider.
    */

    if (providerId === "claude" || providerId === "openai") {
      return res.status(501).json({
        error: `${providerId} integration needs its provider-specific adapter.`
      });
    }

    const provider = providers[providerId];

    if (!provider) {
      return res.status(400).json({
        error: "Unsupported provider."
      });
    }

    if (!provider.key) {
      return res.status(503).json({
        error: `${provider.name} API key is not configured on the backend.`
      });
    }

    const upstream = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: "system",
            content: "You are VISHU AI, a helpful and accurate AI assistant."
          },
          {
            role: "user",
            content: message.trim()
          }
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: false
      }),
      signal: AbortSignal.timeout(60000)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error(
        "Provider error:",
        provider.name,
        upstream.status
      );

      return res.status(502).json({
        error: `${provider.name} request failed. Check the model, API access and usage limits.`
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "The AI provider returned no text response."
      });
    }

    return res.json({
      reply: reply.trim(),
      model: provider.name
    });

  } catch (error) {
    console.error("Chat error:", error.message);

    return res.status(500).json({
      error: "The AI request failed. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`VISHU AI backend running on port ${PORT}`);
});
