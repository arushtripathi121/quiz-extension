// background.js - Service Worker for Chrome Extension
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "PROCESS_FORM") return;

  chrome.storage.local.get("AUTOFILL_ENABLED", data => {
    if (!data.AUTOFILL_ENABLED) {
      console.log("AutoFill is OFF. Background ignored request.");
      sendResponse({ error: "AUTOFILL_OFF", userMessage: "AutoFill is turned OFF" });
      return;
    }

    handleFormProcessing(msg.payload, sendResponse);
  });

  return true; // Keep channel open for async response
});

async function handleFormProcessing(allQuestions, sendResponse) {
  try {
    const { GEMINI_API_KEY } = await chrome.storage.local.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      sendResponse({
        error: "NO_API_KEY",
        userMessage: "Please set your Gemini API key in extension settings"
      });
      return;
    }

    const chunks = createAdaptiveChunks(allQuestions);
    const finalAnswers = [];
    const errors = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkAnswers = await processChunkWithRetry(
          chunks[i],
          GEMINI_API_KEY,
          i,
          chunks.length
        );
        finalAnswers.push(...chunkAnswers);
      } catch (err) {
        console.error(`Chunk ${i + 1} failed:`, err);
        errors.push({ chunk: i + 1, error: err.message });
      }
    }

    sendResponse({
      answers: finalAnswers,
      errors: errors.length ? errors : null,
      processed: finalAnswers.length,
      total: allQuestions.length
    });

  } catch (err) {
    console.error("Background Error:", err);
    sendResponse({
      error: err.message,
      userMessage: "Failed to process form. Please try again."
    });
  }
}

function createAdaptiveChunks(questions) {
  const chunks = [];
  let currentChunk = [];
  let currentTokenEstimate = 0;
  const MAX_TOKENS_PER_CHUNK = 3000;
  const BASE_PROMPT_TOKENS = 100;

  for (const question of questions) {
    const questionTokens = Math.ceil(
      (question.question.length +
        (question.options?.join("").length || 0)) / 4
    );

    if (
      currentTokenEstimate + questionTokens > MAX_TOKENS_PER_CHUNK &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokenEstimate = BASE_PROMPT_TOKENS;
    }

    currentChunk.push(question);
    currentTokenEstimate += questionTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function processChunkWithRetry(
  chunk,
  apiKey,
  chunkIndex,
  totalChunks,
  retries = 2
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await processChunk(chunk, apiKey, chunkIndex, totalChunks);
    } catch (err) {
      if (attempt === retries) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(r => setTimeout(r, delay));
      console.log(`Retrying chunk ${chunkIndex + 1}, attempt ${attempt + 2}`);
    }
  }
}

async function processChunk(chunk, apiKey, chunkIndex, totalChunks) {
  const questionsText = chunk.map((q, idx) => {
    const optionsText = q.options?.length
      ? `\nOptions: ${q.options.map((o, i) => `${i + 1}. ${o}`).join(" | ")}`
      : "";
    return `Question ${idx + 1}:\n${q.question}${optionsText}\nType: ${q.type}`;
  }).join("\n\n");

  const prompt = `You are a form-filling assistant. Answer each question accurately and concisely.

For multiple choice questions (MCQ): Select the exact option text from the provided options.
For checkboxes: Return an array of exact option texts if multiple selections are needed.
For text inputs: Provide a brief, relevant answer.
For paragraphs: Provide a clear, complete answer in 2-3 sentences.

Questions to answer:

${questionsText}

CRITICAL INSTRUCTIONS:
1. Respond with ONLY valid JSON
2. Use double quotes
3. Escape quotes
4. No trailing commas

{"answers":[{"q":"question","a":"answer","type":"mcq"}]}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 4096
        }
      })
    }
  );

  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.error?.message || response.status);
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return [];

  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.answers)) return [];

  return parsed.answers.map(a => ({
    question: a.q || "",
    answer: a.a || "",
    type: a.type
  }));
}
