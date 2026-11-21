/** redhand-bridge popup — pairing token management and per-tab attach. */

const tokenInput = document.getElementById("token") as HTMLInputElement;
const wsUrlInput = document.getElementById("wsUrl") as HTMLInputElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const attachBtn = document.getElementById("attach") as HTMLButtonElement;
const detachBtn = document.getElementById("detach") as HTMLButtonElement;

function setStatus(text: string): void {
  statusDiv.textContent = text;
}

async function loadStored(): Promise<void> {
  const stored = await chrome.storage.local.get(["token", "wsUrl"]);
  tokenInput.value = typeof stored["token"] === "string" ? stored["token"] : "";
  wsUrlInput.value = typeof stored["wsUrl"] === "string" ? stored["wsUrl"] : "ws://127.0.0.1:8765";
}

async function currentTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ token: tokenInput.value.trim(), wsUrl: wsUrlInput.value.trim() });
  setStatus("saved — reconnecting");
});

attachBtn.addEventListener("click", async () => {
  const tabId = await currentTabId();
  if (tabId === undefined) {
    setStatus("no active tab");
    return;
  }
  const response = await chrome.runtime.sendMessage({ op: "popup-attach", tabId });
  setStatus(response?.ok === true ? "attached tab " + String(tabId) : "attach failed");
});

detachBtn.addEventListener("click", async () => {
  const tabId = await currentTabId();
  if (tabId === undefined) {
    return;
  }
  await chrome.runtime.sendMessage({ op: "popup-detach", tabId });
  setStatus("detached");
});

void loadStored();
