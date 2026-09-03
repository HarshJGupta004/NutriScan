const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// @google/genai is an ESM-only package, but this project uses require() (CommonJS).
// A dynamic import() is the standard way to load an ESM package from CommonJS code —
// we do it once and reuse the same client on every request.
let aiClientPromise = null;
function getAiClient() {
  if (!aiClientPromise) {
    aiClientPromise = import("@google/genai").then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    );
  }
  return aiClientPromise;
}

const PROMPT = `
You are an expert nutritionist.

Analyze the uploaded food or packaged food item image.

Identify the food item.

Estimate:
- Calories
- Protein
- Carbohydrates
- Fat
- Sugar
- Fiber
- Sodium
- Saturated Fat
- Trans Fat

Calculate a health score from 0-100.

Classify the food as:
- Healthy
- Moderately Healthy
- Unhealthy

Explain why.

List health benefits.

List possible health risks.

Suggest a healthier alternative.

Return ONLY ONE valid JSON object, no markdown fences, matching exactly this shape:

{
  "food_name": "",
  "category": "",
  "calories": "",
  "protein": "",
  "carbohydrates": "",
  "fat": "",
  "sugar": "",
  "fiber": "",
  "sodium": "",
  "saturated_fat": "",
  "trans_fat": "",
  "health_score": 0,
  "classification": "",
  "benefits": [],
  "risks": [],
  "recommendation": "",
  "alternative": ""
}
`;

function extractJson(text) {
  let cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model response.");
  cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOverloadedError(err) {
  const message = String(err && err.message);
  return message.includes("503") || message.includes("UNAVAILABLE") || message.includes("high demand");
}

function isModelUnavailableError(err) {
  const message = String(err && err.message);
  return (
    message.includes("404") ||
    message.includes("NOT_FOUND") ||
    message.includes("no longer available")
  );
}

function shouldTryNextModel(err) {
  return isOverloadedError(err) || isModelUnavailableError(err);
}

// Gemini occasionally returns 503 when a model is under heavy load — this is
// transient, so a couple of short retries usually gets through.
async function generateWithRetry(ai, params, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!isOverloadedError(err) || isLastAttempt) throw err;
      await sleep(1000 * (i + 1)); // 1s, then 2s
    }
  }
}

// Try these in order: if the first is overloaded, fall back to the next one.
// Google retired gemini-2.5-flash / gemini-2.0-flash for newer API keys and
// moved to the Gemini 3 family — these are the current stable Flash models
// (cheapest/fastest first isn't the goal here, steadiness is).
const MODEL_CANDIDATES = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

async function generateWithFallback(ai, baseParams) {
  let lastErr;
  for (const model of MODEL_CANDIDATES) {
    try {
      return await generateWithRetry(ai, { ...baseParams, model });
    } catch (err) {
      lastErr = err;
      if (!shouldTryNextModel(err)) throw err; // real error, don't keep trying other models
    }
  }
  throw lastErr;
}

// POST /api/analyze  (multipart/form-data, field name "image")
router.post("/", requireAuth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Upload a food image first." });
    }

    const base64Image = req.file.buffer.toString("base64");
    const ai = await getAiClient();

    const response = await generateWithFallback(ai, {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: req.file.mimetype, data: base64Image } },
            { text: PROMPT }
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });

    const rawText = response.text;
    let data;
    try {
      data = extractJson(rawText);
    } catch (parseErr) {
      console.error("Bad model output:", rawText);
      return res.status(502).json({ error: "The model didn't return valid JSON. Try again." });
    }

    // Save a short trail of past scans on the user's account
    await User.findByIdAndUpdate(req.userId, {
      $push: {
        history: {
          $each: [
            {
              food_name: data.food_name,
              health_score: Number(String(data.health_score).split("/")[0]) || 0,
              classification: data.classification
            }
          ],
          $slice: -20
        }
      }
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    if (isOverloadedError(err)) {
      return res.status(503).json({
        error: "Gemini is under heavy load right now. Please wait a moment and try again."
      });
    }
    if (isModelUnavailableError(err)) {
      return res.status(502).json({
        error: "The AI model configured for this app is no longer available. Check routes/analyze.js and update MODEL_CANDIDATES to a current model name."
      });
    }
    res.status(500).json({ error: "Analysis failed. Try again in a moment." });
  }
});

module.exports = router;
