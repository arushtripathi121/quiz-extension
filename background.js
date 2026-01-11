// background.js - Service Worker for Chrome Extension
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "PROCESS_FORM") return;

  handleFormProcessing(msg.payload, sendResponse);
  return true; // Keep channel open for async response
});

async function handleFormProcessing(allQuestions, sendResponse) {
  try {
    const { GEMINI_API_KEY } = await chrome.storage.local.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      sendResponse({ error: "NO_API_KEY", userMessage: "Please set your Gemini API key in extension settings" });
      return;
    }

    // Adaptive chunking based on question complexity
    const chunks = createAdaptiveChunks(allQuestions);
    const finalAnswers = [];
    const errors = [];

    // Process chunks with retry logic
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkAnswers = await processChunkWithRetry(chunks[i], GEMINI_API_KEY, i, chunks.length);
        finalAnswers.push(...chunkAnswers);
      } catch (err) {
        console.error(`Chunk ${i + 1} failed:`, err);
        errors.push({ chunk: i + 1, error: err.message });
        // Continue processing other chunks
      }
    }

    sendResponse({ 
      answers: finalAnswers,
      errors: errors.length > 0 ? errors : null,
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
  const MAX_TOKENS_PER_CHUNK = 3000; // Conservative limit for input
  const BASE_PROMPT_TOKENS = 100;

  for (const question of questions) {
    // Rough token estimate: ~4 chars per token
    const questionTokens = Math.ceil((question.question.length + 
      (question.options?.join("").length || 0)) / 4);
    
    // If adding this question exceeds limit, start new chunk
    if (currentTokenEstimate + questionTokens > MAX_TOKENS_PER_CHUNK && currentChunk.length > 0) {
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

async function processChunkWithRetry(chunk, apiKey, chunkIndex, totalChunks, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await processChunk(chunk, apiKey, chunkIndex, totalChunks);
    } catch (err) {
      if (attempt === retries) throw err;
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`Retrying chunk ${chunkIndex + 1}, attempt ${attempt + 2}`);
    }
  }
}

async function processChunk(chunk, apiKey, chunkIndex, totalChunks) {
  // Create structured prompt with clear instructions
  const questionsText = chunk.map((q, idx) => {
    const optionsText = q.options && q.options.length > 0 
      ? `\nOptions: ${q.options.map((opt, i) => `${i + 1}. ${opt}`).join(" | ")}`
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
1. Respond with ONLY valid JSON - no markdown, no explanations, no extra text
2. Use double quotes for all strings
3. Escape any quotes inside strings with backslash
4. Do not include trailing commas
5. Format exactly as shown below:

{"answers":[{"q":"question 1 text","a":"answer 1","type":"mcq"},{"q":"question 2 text","a":"answer 2","type":"short"}]}`;

  const requestBody = {
    contents: [{ 
      role: "user", 
      parts: [{ text: prompt }] 
    }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 4096,
      candidateCount: 1
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }

  const json = await response.json();
  
  // Handle safety blocks
  if (json.promptFeedback?.blockReason) {
    console.warn("Prompt blocked:", json.promptFeedback.blockReason);
    throw new Error("Content was blocked by safety filters");
  }

  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.warn(`Empty response for chunk ${chunkIndex + 1}`);
    return [];
  }

  // Clean the response - remove markdown code blocks if present
  let cleanedText = rawText.trim();
  cleanedText = cleanedText.replace(/^```json\s*/i, '');
  cleanedText = cleanedText.replace(/^```\s*/i, '');
  cleanedText = cleanedText.replace(/\s*```$/i, '');
  cleanedText = cleanedText.trim();

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (parseError) {
    console.error("JSON Parse Error:", parseError);
    console.error("Raw text:", rawText);
    console.error("Cleaned text:", cleanedText);
    
    // Try to extract JSON from the response
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        throw new Error(`Failed to parse JSON: ${parseError.message}`);
      }
    } else {
      throw new Error(`No valid JSON found in response: ${parseError.message}`);
    }
  }
  
  if (!parsed.answers || !Array.isArray(parsed.answers)) {
    console.warn("Invalid response structure:", parsed);
    return [];
  }

  return parsed.answers.map(item => ({
    question: item.q || "",
    answer: item.a || "",
    type: item.type
  }));
}