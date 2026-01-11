// content.js - Content Script for Google Forms
(function () {

  chrome.storage.local.get("AUTOFILL_ENABLED", data => {
    if (!data.AUTOFILL_ENABLED) {
      console.log("AutoFill is OFF. Content script aborted.");
      return;
    }

    if (window.__AUTO_FILL_RUNNING__) {
      console.log("Auto-fill already in progress");
      return;
    }

    if (window.__STOP_AUTOFILL__) {
      console.log("Auto-fill stopped before start");
      return;
    }

    window.__AUTO_FILL_RUNNING__ = true;

    const normalize = s => s.replace(/\*/g, "").replace(/\s+/g, " ").trim();

    function showStatus(message, type = "info") {
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
      const parent = el.closest(
        '[role="presentation"], label, .freebirdFormviewerComponentsQuestionRadioChoice, .freebirdFormviewerComponentsQuestionCheckboxChoice'
      );
      if (!parent) return el.getAttribute("aria-label") || "";

      const clone = parent.cloneNode(true);
      clone.querySelectorAll("input, [role='radio'], [role='checkbox']").forEach(e => e.remove());
      return normalize(clone.textContent);
    }

    function extractQuestions() {
      if (window.__STOP_AUTOFILL__) return [];

      const questions = [];
      const questionBlocks = document.querySelectorAll('[role="listitem"]');

      if (questionBlocks.length === 0) {
        throw new Error("No form questions found. Make sure you're on a Google Form.");
      }

      questionBlocks.forEach((item, index) => {
        if (window.__STOP_AUTOFILL__) return;

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
            if (optText && !options.includes(optText)) options.push(optText);
          });
        } else if (checkboxes.length > 0) {
          type = "checkbox";
          checkboxes.forEach(c => {
            const optText = getOptionText(c);
            if (optText && !options.includes(optText)) options.push(optText);
          });
        } else if (textArea) {
          type = "paragraph";
        } else if (textInput) {
          type = "short";
        }

        questions.push({
          question: questionText,
          type,
          options: options.length ? options : null,
          index
        });
      });

      return questions;
    }

    function fillForm(answers) {
      let filled = 0;
      const questionBlocks = document.querySelectorAll('[role="listitem"]');

      questionBlocks.forEach(item => {
        if (window.__STOP_AUTOFILL__) return;

        const headingEl = item.querySelector('[role="heading"]');
        if (!headingEl) return;

        const qText = normalize(headingEl.innerText);
        const answerData = answers.find(a => normalize(a.question) === qText);
        if (!answerData || !answerData.answer) return;

        try {
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

          const radios = item.querySelectorAll('[role="radio"]');
          if (radios.length > 0) {
            radios.forEach(r => {
              if (normalize(getOptionText(r)) === normalize(answerData.answer)) {
                r.click();
                filled++;
              }
            });
            return;
          }

          const checkboxes = item.querySelectorAll('[role="checkbox"]');
          if (checkboxes.length > 0) {
            const arr = Array.isArray(answerData.answer)
              ? answerData.answer
              : [answerData.answer];

            checkboxes.forEach(c => {
              if (arr.some(a => normalize(a) === normalize(getOptionText(c)))) {
                c.click();
              }
            });
            filled++;
          }

        } catch (err) {
          console.error(`Error filling question "${qText}":`, err);
        }
      });

      return filled;
    }

    showStatus("Extracting form questions...", "info");

    try {
      const questions = extractQuestions();

      if (window.__STOP_AUTOFILL__) {
        showStatus("AutoFill stopped", "info");
        window.__AUTO_FILL_RUNNING__ = false;
        return;
      }

      if (!questions.length) {
        showStatus("No questions found", "error");
        window.__AUTO_FILL_RUNNING__ = false;
        return;
      }

      showStatus(`Processing ${questions.length} questions...`, "info");

      chrome.runtime.sendMessage(
        { action: "PROCESS_FORM", payload: questions },
        response => {
          window.__AUTO_FILL_RUNNING__ = false;

          if (window.__STOP_AUTOFILL__) {
            showStatus("AutoFill stopped", "info");
            return;
          }

          if (!response || response.error) {
            showStatus(response?.userMessage || "Processing failed", "error");
            return;
          }

          const filled = fillForm(response.answers || []);
          showStatus(
            `Filled ${filled}/${questions.length} questions`,
            filled ? "success" : "error"
          );
        }
      );

    } catch (err) {
      console.error(err);
      showStatus(err.message, "error");
      window.__AUTO_FILL_RUNNING__ = false;
    }

  });

})();
