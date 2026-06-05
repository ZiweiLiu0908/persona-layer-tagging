const promptDefaults = {
  1: window.DEFAULT_PROMPT_1 || "",
  2: window.DEFAULT_PROMPT_2 || "",
  3: window.DEFAULT_PROMPT_3 || "",
  6: window.DEFAULT_PROMPT_6 || "",
};
const promptNumbers = [1, 2, 3, 6];

let serverConfig = null;

const byId = (id) => document.getElementById(id);

function setMessage(type, text) {
  const bar = byId("messageBar");
  if (!text) {
    bar.hidden = true;
    bar.className = "message-bar";
    bar.textContent = "";
    return;
  }
  bar.hidden = false;
  bar.className = `message-bar ${type}`;
  bar.textContent = text;
}

function promptValue(number) {
  return serverConfig?.prompts?.[String(number)] || promptDefaults[number] || "";
}

function loadPromptDescriptions(descriptions = {}) {
  byId("promptExplainList").innerHTML = promptNumbers
    .map((number) => {
      const text = descriptions[String(number)] || byId(`promptDesc${number}`).textContent;
      byId(`promptDesc${number}`).textContent = text;
      return `<article class="info-card">
        <span>Prompt ${number}</span>
        <b>${text}</b>
      </article>`;
    })
    .join("");
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const config = await response.json();
  if (!response.ok) throw new Error(config.message || config.error || "读取配置失败");
  serverConfig = config;

  byId("apiKeyHint").textContent = config.has_api_key
    ? `当前已配置：${config.api_key_masked}`
    : "当前未配置 API Key";
  byId("textApiUrlInput").value = config.text_api_url || "";
  byId("textModelInput").value = config.text_model || "";
  byId("videoApiUrlInput").value = config.video_api_url || "";
  byId("defaultConcurrencyInput").value = config.default_api_concurrency || 200;
  byId("bloggerMinVideoCountInput").value = config.blogger_min_video_count || 15;
  byId("videoWorkerCountInput").value = config.video_worker_count || 20;
  byId("bloggerWorkerCountInput").value = config.blogger_worker_count || 5;
  for (const number of promptNumbers) {
    byId(`prompt${number}`).value = promptValue(number);
  }
  loadPromptDescriptions(config.prompt_descriptions || {});
  byId("promptStatus").textContent = `配置来源：${config.config_source || "defaults"}`;
}

async function saveConfig() {
  const prompts = {};
  for (const number of promptNumbers) {
    prompts[String(number)] = byId(`prompt${number}`).value;
  }
  const body = {
    api_key: byId("apiKeyInput").value.trim(),
    text_api_url: byId("textApiUrlInput").value.trim(),
    text_model: byId("textModelInput").value.trim(),
    video_api_url: byId("videoApiUrlInput").value.trim(),
    default_api_concurrency: Number(byId("defaultConcurrencyInput").value || 200),
    blogger_min_video_count: Number(byId("bloggerMinVideoCountInput").value || 15),
    video_worker_count: Number(byId("videoWorkerCountInput").value || 20),
    blogger_worker_count: Number(byId("bloggerWorkerCountInput").value || 5),
    prompts,
  };
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || payload.error || "保存失败");
  byId("apiKeyInput").value = "";
  serverConfig = payload.data;
  byId("promptStatus").textContent = `已保存：${new Date().toLocaleString()}`;
  setMessage("success", "配置已保存。Prompt/API 会用于后续任务；Worker 数量重启后完全生效。");
  await loadConfig();
}

function resetPrompts() {
  for (const number of promptNumbers) {
    byId(`prompt${number}`).value = promptDefaults[number] || "";
  }
  setMessage("success", "已恢复默认 Prompt，点击保存后生效。");
}

window.addEventListener("DOMContentLoaded", () => {
  loadConfig().catch((error) => setMessage("error", error.message));
  byId("savePromptsBtn").addEventListener("click", () => saveConfig().catch((error) => setMessage("error", error.message)));
  byId("resetPromptsBtn").addEventListener("click", resetPrompts);
});
