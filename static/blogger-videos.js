let tasks = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function todayBeijing() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 16 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text;
}

function statusClass(status) {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "pending") return "waiting";
  if (status === "running") return "running";
  return "neutral";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function setMessage(type, text) {
  const bar = $("messageBar");
  if (!text) {
    bar.hidden = true;
    bar.textContent = "";
    bar.className = "message-bar";
    return;
  }
  bar.hidden = false;
  bar.className = `message-bar ${type}`;
  bar.textContent = text;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    throw new Error(payload.message || payload.error || "请求失败");
  }
  return payload;
}

function videoProgress(task) {
  const stages = [
    ["描述", task.video_description_unit],
    ["10属性", task.personal_tags],
  ];
  const done = stages.filter(([, value]) => Boolean(value)).length;
  return `<div class="stage-list">${stages.map(([label, value]) => `<span class="${value ? "done" : ""}">${escapeHtml(label)}</span>`).join("")}</div>
  <p class="muted">${done}/2 阶段</p>`;
}

function bloggerProfileLink(task) {
  if (!task.blogger_url) return `<span class="muted">无</span>`;
  return `<a class="table-link row-link" href="${escapeHtml(task.blogger_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(task.blogger_url)}</a>`;
}

function sourceVideoLink(task) {
  if (!task.source_url) return "";
  return `<a class="table-link row-link" href="${escapeHtml(task.source_url)}" target="_blank" rel="noopener noreferrer">TikTok 原视频：${escapeHtml(task.source_url)}</a>`;
}

function renderSummary() {
  const counts = tasks.reduce((acc, task) => {
    acc.total += 1;
    acc[task.status] = (acc[task.status] || 0) + 1;
    if (task.callback_status === "failed") acc.callbackFailed += 1;
    return acc;
  }, { total: 0, callbackFailed: 0 });
  const cards = [
    ["全部视频", counts.total, "当前筛选结果"],
    ["运行/等待", (counts.running || 0) + (counts.pending || 0), "pending/running"],
    ["成功", counts.success || 0, "可读取结果"],
    ["失败/回调失败", `${counts.failed || 0}/${counts.callbackFailed}`, "任务失败 / 回调失败"],
  ];
  $("summaryCards").innerHTML = cards.map(([title, value, note]) => `<article class="summary-card">
    <span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p>
  </article>`).join("");
}

function renderRows() {
  if (!tasks.length) {
    $("taskRows").innerHTML = `<tr><td colspan="6" class="empty-row">当前筛选下暂无该博主的视频任务。</td></tr>`;
    return;
  }
  $("taskRows").innerHTML = tasks.map((task) => `<tr class="clickable-row" data-detail-url="/task-detail.html?type=video&id=${encodeURIComponent(task.video_id)}">
    <td><span class="kind-chip">视频</span><b>视频 ${escapeHtml(shortId(task.video_id))}</b>
      ${sourceVideoLink(task)}
      ${task.gcs_url ? `<span class="table-link">${escapeHtml(task.gcs_url)}</span>` : ""}
    </td>
    <td>${bloggerProfileLink(task)}</td>
    <td><span class="status-pill ${statusClass(task.status)}">${escapeHtml(task.status || "-")}</span><p class="muted">${escapeHtml(task.result_message || task.error_message || "")}</p></td>
    <td>${videoProgress(task)}</td>
    <td><span class="status-pill ${statusClass(task.callback_status)}">${escapeHtml(task.callback_status || "未回调")}</span><p class="muted">${escapeHtml(task.callback_response_code || "")}</p></td>
    <td><p class="muted">创建 ${escapeHtml(formatDate(task.created_at))}</p><p class="muted">更新 ${escapeHtml(formatDate(task.updated_at))}</p></td>
  </tr>`).join("");
  document.querySelectorAll("#taskRows .clickable-row").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href = row.dataset.detailUrl;
    });
  });
  document.querySelectorAll("#taskRows .row-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
}

async function loadTasks() {
  const params = new URLSearchParams(window.location.search);
  const bloggerId = params.get("blogger_id");
  if (!bloggerId) throw new Error("缺少 blogger_id");
  $("bloggerIdLine").textContent = `博主 ID ${bloggerId}`;
  $("pageTitle").textContent = `博主 ${shortId(bloggerId)} 的视频任务`;

  const query = new URLSearchParams({ limit: $("limitInput").value || "100" });
  if ($("statusFilter").value) query.set("status", $("statusFilter").value);
  if ($("dateFilter").value) query.set("date", $("dateFilter").value);
  const payload = await parseResponse(
    await fetch(`/api/v1/bloggers/${encodeURIComponent(bloggerId)}/video-tagging/tasks?${query.toString()}`)
  );
  tasks = payload.data?.tasks || [];
  renderSummary();
  renderRows();
  setMessage("", "");
}

window.addEventListener("DOMContentLoaded", () => {
  $("dateFilter").value = todayBeijing();
  $("refreshBtn").addEventListener("click", () => loadTasks().catch((error) => setMessage("error", error.message)));
  ["dateFilter", "statusFilter", "limitInput"].forEach((id) => {
    $(id).addEventListener("change", () => loadTasks().catch((error) => setMessage("error", error.message)));
  });
  loadTasks().catch((error) => {
    tasks = [];
    renderSummary();
    renderRows();
    setMessage("error", error.message);
  });
});
