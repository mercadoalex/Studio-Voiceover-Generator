import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API endpoint for Text-To-Speech generation
app.post("/api/generate-tts", async (req, res) => {
  try {
    const { text, voiceName, toneDescription } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text content is required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY environment variable is not configured. Please add it under Settings > Secrets in the AI Studio panel."
      });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Formulate a style directive based on the user's requirements
    const prompt = `Style instruction: ${toneDescription || "dry recording studio format, natural rhythm, medium-low tone"}. Read the following text: ${text}`;

    console.log(`[TTS] Requesting voice: ${voiceName || "Charon"} for text length ${text.length}`);

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || "Charon" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({
        error: "No audio data was returned by the Gemini TTS model. Check if the model instructions or API key are correct."
      });
    }

    res.json({ base64Audio });
  } catch (err: any) {
    console.error("[TTS Error]:", err);
    res.status(500).json({ error: err.message || "An error occurred during voice generation." });
  }
});

// Setup Vite Dev Server / Static Hosting
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to boot server:", err);
});
