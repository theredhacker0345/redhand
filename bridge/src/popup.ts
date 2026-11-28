/** redhand-bridge popup — paste the pairing token printed by `redhand serve`. */

const tokenInput = document.getElementById("token") as HTMLInputElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;

function setStatus(text: string): void {
  statusDiv.textContent = text;
}

async function loadStored(): Promise<void> {
  const stored = await chrome.storage.local.get(["hubToken"]);
  tokenInput.value = typeof stored["hubToken"] === "string" ? stored["hubToken"] : "";
}

saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ hubToken: tokenInput.value.trim() });
  setStatus("saved — reconnecting to hub…");
});

void loadStored();
