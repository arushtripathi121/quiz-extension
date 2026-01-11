// popup.js - Popup UI Logic
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const fillBtn = document.getElementById("fillBtn");
const statusDiv = document.getElementById("status");
const keyStatusDiv = document.getElementById("keyStatus");

// Load saved API key on popup open
chrome.storage.local.get("GEMINI_API_KEY", (data) => {
  if (data.GEMINI_API_KEY) {
    const key = data.GEMINI_API_KEY;
    apiKeyInput.value = key;
    fillBtn.disabled = false;
    showKeyStatus(`✓ API key saved (${key.substring(0, 8)}...)`);
  }
});

// Check if current tab is a Google Form
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  if (currentTab && currentTab.url && currentTab.url.includes("docs.google.com/forms")) {
    // Already enabled if API key exists
  } else {
    fillBtn.disabled = true;
    fillBtn.textContent = "Open a Google Form to use";
  }
});

// Save API key
saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus("Please enter an API key", "error");
    return;
  }

  // Basic validation
  if (apiKey.length < 20) {
    showStatus("Invalid API key format", "error");
    return;
  }

  chrome.storage.local.set({ GEMINI_API_KEY: apiKey }, () => {
    showStatus("API key saved successfully!", "success");
    showKeyStatus(`✓ API key saved (${apiKey.substring(0, 8)}...)`);
    fillBtn.disabled = false;
    fillBtn.textContent = "Fill Current Form";
  });
});

// Clear API key
clearBtn.addEventListener("click", () => {
  chrome.storage.local.remove("GEMINI_API_KEY", () => {
    apiKeyInput.value = "";
    showStatus("API key cleared", "info");
    keyStatusDiv.style.display = "none";
    fillBtn.disabled = true;
  });
});

// Fill form button
fillBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus("Please save your API key first", "error");
    return;
  }

  fillBtn.disabled = true;
  fillBtn.textContent = "Processing...";
  showStatus("Starting form auto-fill...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("docs.google.com/forms")) {
      showStatus("Please open a Google Form", "error");
      fillBtn.disabled = false;
      fillBtn.textContent = "Fill Current Form";
      return;
    }

    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    showStatus("Form processing started! Check the form page for updates.", "success");
    
    // Re-enable button after a delay
    setTimeout(() => {
      fillBtn.disabled = false;
      fillBtn.textContent = "Fill Current Form";
    }, 2000);

  } catch (err) {
    console.error("Fill error:", err);
    showStatus(`Error: ${err.message}`, "error");
    fillBtn.disabled = false;
    fillBtn.textContent = "Fill Current Form";
  }
});

function showStatus(message, type = "info") {
  statusDiv.textContent = message;
  statusDiv.className = `status show ${type}`;
  
  setTimeout(() => {
    statusDiv.classList.remove("show");
  }, 5000);
}

function showKeyStatus(message) {
  keyStatusDiv.textContent = message;
  keyStatusDiv.style.display = "block";
}