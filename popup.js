const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const fillBtn = document.getElementById("fillBtn");
const toggle = document.getElementById("toggleAutofill");
const statusDiv = document.getElementById("status");

chrome.storage.local.get(["GEMINI_API_KEY", "AUTOFILL_ENABLED"], data => {
  if (data.GEMINI_API_KEY) {
    apiKeyInput.value = data.GEMINI_API_KEY;
    fillBtn.disabled = false;
  }
  toggle.checked = !!data.AUTOFILL_ENABLED;
});

saveBtn.onclick = () => {
  const key = apiKeyInput.value.trim();
  if (!key) return show("Enter API key", "error");

  chrome.storage.local.set({ GEMINI_API_KEY: key }, () => {
    fillBtn.disabled = false;
    show("API key saved", "success");
  });
};

clearBtn.onclick = () => {
  chrome.storage.local.clear(() => {
    apiKeyInput.value = "";
    fillBtn.disabled = true;
    toggle.checked = false;
    show("Cleared", "info");
  });
};

toggle.onchange = () => {
  chrome.storage.local.set({ AUTOFILL_ENABLED: toggle.checked });
  show(toggle.checked ? "AutoFill ON" : "AutoFill OFF", "info");
};

fillBtn.onclick = async () => {
  const { AUTOFILL_ENABLED } = await chrome.storage.local.get("AUTOFILL_ENABLED");
  if (!AUTOFILL_ENABLED) return show("Turn ON AutoFill first", "error");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => { window.__STOP_AUTOFILL__ = false; }
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  show("AutoFill running…", "info");
};

function show(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = `status show ${type}`;
  setTimeout(() => statusDiv.classList.remove("show"), 4000);
}
