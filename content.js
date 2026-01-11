// content.js - Content Script for Google Forms
(function () {
  if (window.__AUTO_FILL_RUNNING__) {
    console.log("Auto-fill already in progress");
    return;
  }
  window.__AUTO_FILL_RUNNING__ = true;

  const normalize = s => s.replace(/\*/g, "").replace(/\s+/g, " ").trim();

  function showStatus(message, type = "info") {
    // Remove existing status
    const existing = document.getElementById("gemini-autofill-status");
    if (existing) existing.remove();

    const status = document.createElement("div");
    status.id = "gemini-autofill-status";
    status.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === "error" ? "#f44336" : type === "success" ? "#4CAF50" : "#2196F3"};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: slideIn 0.3s ease;
    `;
    status.textContent = message;
    document.body.appendChild(status);

    if (type !== "info") {
      setTimeout(() => status.remove(), 5000);
    }
  }

  // Add animation
  if (!document.getElementById("gemini-autofill-styles")) {
    const style = document.createElement("style");
    style.id = "gemini-autofill-styles";
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function getOptionText(el) {
    const parent = el.closest('[role="presentation"], label, .freebirdFormviewerComponentsQuestionRadioChoice, .freebirdFormviewerComponentsQuestionCheckboxChoice');
    if (!parent) return el.getAttribute("aria-label") || "";
    
    // Get the text, excluding nested elements
    const clone = parent.cloneNode(true);
    const nestedInputs = clone.querySelectorAll("input, [role='radio'], [role='checkbox']");
    nestedInputs.forEach(input => input.remove());
    
    return normalize(clone.textContent);
  }

  function extractQuestions() {
    const questions = [];
    const questionBlocks = document.querySelectorAll('[role="listitem"]');

    if (questionBlocks.length === 0) {
      throw new Error("No form questions found. Make sure you're on a Google Form.");
    }

    questionBlocks.forEach((item, index) => {
      const headingEl = item.querySelector('[role="heading"]');
      if (!headingEl) return;

      const questionText = normalize(headingEl.innerText);
      if (!questionText) return;

      let type = "short";
      let options = [];

      const radios = item.querySelectorAll('[role="radio"]');
      const checkboxes = item.querySelectorAll('[role="checkbox"]');
      const textArea = item.querySelector("textarea");
      const textInput = item.querySelector('input[type="text"]');

      if (radios.length > 0) {
        type = "mcq";
        radios.forEach(r => {
          const optText = getOptionText(r);
          if (optText && !options.includes(optText)) {
            options.push(optText);
          }
        });
      } else if (checkboxes.length > 0) {
        type = "checkbox";
        checkboxes.forEach(c => {
          const optText = getOptionText(c);
          if (optText && !options.includes(optText)) {
            options.push(optText);
          }
        });
      } else if (textArea) {
        type = "paragraph";
      } else if (textInput) {
        type = "short";
      }

      questions.push({ 
        question: questionText, 
        type, 
        options: options.length > 0 ? options : null,
        index 
      });
    });

    return questions;
  }

  function fillForm(answers) {
    let filled = 0;
    const questionBlocks = document.querySelectorAll('[role="listitem"]');

    questionBlocks.forEach(item => {
      const headingEl = item.querySelector('[role="heading"]');
      if (!headingEl) return;

      const qText = normalize(headingEl.innerText);
      const answerData = answers.find(a => normalize(a.question) === qText);
      
      if (!answerData || !answerData.answer) return;

      try {
        // Handle text inputs
        const textInput = item.querySelector('input[type="text"]');
        const textArea = item.querySelector('textarea');
        
        if (textInput || textArea) {
          const input = textInput || textArea;
          input.value = answerData.answer;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("blur", { bubbles: true }));
          filled++;
          return;
        }

        // Handle radio buttons (MCQ)
        const radios = item.querySelectorAll('[role="radio"]');
        if (radios.length > 0) {
          let found = false;
          radios.forEach(r => {
            const optText = getOptionText(r);
            if (normalize(optText) === normalize(answerData.answer)) {
              r.click();
              found = true;
              filled++;
            }
          });
          if (!found) {
            console.warn(`MCQ option not found for: "${qText}" -> "${answerData.answer}"`);
          }
          return;
        }

        // Handle checkboxes
        const checkboxes = item.querySelectorAll('[role="checkbox"]');
        if (checkboxes.length > 0) {
          const answersArray = Array.isArray(answerData.answer) 
            ? answerData.answer 
            : [answerData.answer];
          
          let checkedCount = 0;
          checkboxes.forEach(c => {
            const optText = getOptionText(c);
            if (answersArray.some(ans => normalize(ans) === normalize(optText))) {
              c.click();
              checkedCount++;
            }
          });
          if (checkedCount > 0) filled++;
          return;
        }

      } catch (err) {
        console.error(`Error filling question "${qText}":`, err);
      }
    });

    return filled;
  }

  // Main execution
  showStatus("Extracting form questions...", "info");

  try {
    const questions = extractQuestions();
    
    if (questions.length === 0) {
      showStatus("No questions found on this page", "error");
      window.__AUTO_FILL_RUNNING__ = false;
      return;
    }

    showStatus(`Processing ${questions.length} questions...`, "info");

    chrome.runtime.sendMessage(
      { action: "PROCESS_FORM", payload: questions },
      response => {
        window.__AUTO_FILL_RUNNING__ = false;

        if (!response) {
          showStatus("No response from extension. Please reload and try again.", "error");
          return;
        }

        if (response.error) {
          showStatus(response.userMessage || response.error, "error");
          return;
        }

        if (response.answers && response.answers.length > 0) {
          const filled = fillForm(response.answers);
          const message = response.errors 
            ? `Filled ${filled}/${questions.length} questions (${response.errors.length} chunks failed)`
            : `Successfully filled ${filled}/${questions.length} questions`;
          
          showStatus(message, filled > 0 ? "success" : "error");
        } else {
          showStatus("No answers received from AI", "error");
        }
      }
    );

  } catch (err) {
    console.error("Form extraction error:", err);
    showStatus(err.message, "error");
    window.__AUTO_FILL_RUNNING__ = false;
  }
})();