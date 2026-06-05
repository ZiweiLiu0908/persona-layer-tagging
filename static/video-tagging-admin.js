let tasks = [];
let selectedTaskKey = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 14 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

function taskKey(task) {
  return `${task.kind}:${task.id}`;
}

function statusClass(status) {
  if (status === "success" || status === "done") return "done";
  if (status === "failed") return "failed";
  if (["running", "checking_videos", "waiting_videos", "aggregating"].includes(status)) return "running";
  return "";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function normalizeTasks(payload) {
  const videoTasks = (payload.data?.video_tasks || payload.data?.tasks || []).map((task) => ({
    ...task,
    kind: "video",
  }));
  const bloggerTasks = (payload.data?.blogger_tasks || []).map((task) => ({
    ...task,
    kind: "blogger",
  }));
  return [...bloggerTasks, ...videoTasks].sort((a, b) => {
    const at = new Date(a.updated_at || a.created_at || 0).getTime();
    const bt = new Date(b.updated_at || b.created_at || 0).getTime();
    return bt - at;
  });
}

function renderSummary() {
  const counts = tasks.reduce(
    (acc, task) => {
      acc.total += 1;
      acc[task.kind] += 1;
      acc[task.status] = (acc[task.status] || 0) + 1;
      if (task.callback_status === "failed") acc.callbackFailed += 1;
      return acc;
    },
    { total: 0, video: 0, blogger: 0, callbackFailed: 0 }
  );
  const cards = [
    ["全部任务", counts.total, "当前筛选结果"],
    ["博主任务", counts.blogger, "账号级打标"],
    ["视频任务", counts.video, "单视频打标"],
    ["运行中", (counts.running || 0) + (counts.checking_videos || 0) + (counts.waiting_videos || 0) + (counts.aggregating || 0), "含等待视频补标"],
    ["已完成", counts.success || 0, "可直接读取结果"],
    ["失败/回调", `${counts.failed || 0}/${counts.callbackFailed}`, "失败任务 / 回调失败"],
  ];
  $("taskSummaryCards").innerHTML = cards
    .map(
      ([label, value, note]) => `<div class="summary-card">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(value)}</b>
        <p>${escapeHtml(note)}</p>
      </div>`
    )
    .join("");
}

function videoProgress(task) {
  const done = [
    task.video_description_unit,
    task.personal_tags,
  ].filter(Boolean).length;
  return `<div class="stage-grid compact-stages">
    <span class="${task.video_description_unit ? "stage-done" : ""}">描述</span>
    <span class="${task.personal_tags ? "stage-done" : ""}">10属性</span>
  </div>
  <p class="muted">${done}/2 阶段</p>`;
}

function bloggerProgress(task) {
  const min = Number(task.min_video_count || 15);
  const success = Number(task.successful_video_count || 0);
  const submitted = Number(task.submitted_video_count || 0);
  const failed = Number(task.failed_video_count || 0);
  const percent = Math.min(100, Math.round((success / Math.max(min, 1)) * 100));
  return `<div class="progress-top">
      <span>${success}/${min} 成功视频</span>
      <b>${percent}%</b>
    </div>
    <div class="progress-track"><span style="width:${percent}%"></span></div>
    <p class="muted">可用 ${escapeHtml(task.usable_video_count || 0)} · 已提交补标 ${submitted} · 失败 ${failed}</p>`;
}

function renderRows() {
  $("taskCount").textContent = `${tasks.length} 条`;
  $("taskRows").innerHTML = tasks
    .map((task) => {
      const selected = taskKey(task) === selectedTaskKey ? "selected-row" : "";
      const isBlogger = task.kind === "blogger";
      const title = isBlogger ? `博主 ${shortId(task.tiktok_blogger_id)}` : `视频 ${shortId(task.video_id)}`;
      const link = isBlogger ? "" : task.gcs_url;
      const progress = isBlogger ? bloggerProgress(task) : videoProgress(task);
      return `<tr class="${selected}">
        <td>
          <div class="task-kind">${isBlogger ? "博主" : "视频"}</div>
          <div class="blogger-name">${escapeHtml(title)}</div>
          ${link ? `<a class="muted break-link" href="${escapeHtml(link)}" target="_blank">${escapeHtml(link)}</a>` : ""}
        </td>
        <td>
          <div class="status-pill ${statusClass(task.status)}">${escapeHtml(task.status || "-")}</div>
          <p class="muted">${escapeHtml(task.result_message || task.error_message || "")}</p>
        </td>
        <td class="progress-cell">${progress}</td>
        <td>
          <div class="status-pill ${statusClass(task.callback_status)}">${escapeHtml(task.callback_status || "未回调")}</div>
          <p class="muted">${escapeHtml(task.callback_response_code || "")}</p>
        </td>
        <td>
          <p class="muted">创建 ${escapeHtml(formatDate(task.created_at))}</p>
          <p class="muted">更新 ${escapeHtml(formatDate(task.updated_at))}</p>
          <p class="muted">完成 ${escapeHtml(formatDate(task.finished_at))}</p>
        </td>
        <td><button class="secondary" data-task-key="${escapeHtml(taskKey(task))}">详情</button></td>
      </tr>`;
    })
    .join("");
  document.querySelectorAll("[data-task-key]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTaskKey = button.dataset.taskKey;
      renderRows();
      renderDetail();
    });
  });
}

function readableValue(value) {
  if (value == null || value === "") return "无";
  if (Array.isArray(value)) return value.join("、") || "无";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function infoCard(label, value) {
  return `<div class="tag-card"><b>${escapeHtml(label)}</b><span>${escapeHtml(readableValue(value))}</span></div>`;
}

function renderJsonBlock(title, value) {
  if (!value) return "";
  return `<details class="readable-details">
    <summary>${escapeHtml(title)}</summary>
    <pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>
  </details>`;
}

function renderPersonalTags(tags) {
  if (!tags) return "";
  const fields = [
    ["基础人口", tags.basic_demographics],
    ["消费层级", tags.consumption_tier],
    ["气质心理", tags.temperament_psychology],
    ["社交身份", tags.social_identity],
    ["Occasion", tags.occasion],
  ];
  return `<div class="detail-block">
    <h3>账号最终属性</h3>
    <div class="tag-grid">${fields.map(([label, value]) => infoCard(label, value)).join("")}</div>
  </div>`;
}

function renderVideoDetail(task) {
  return `
    <div class="detail-block">
      <h3>视频 ${escapeHtml(shortId(task.video_id))}</h3>
      <a class="muted break-link" href="${escapeHtml(task.gcs_url)}" target="_blank">${escapeHtml(task.gcs_url || "")}</a>
    </div>
    <div class="tag-grid">
      ${infoCard("任务 ID", task.id)}
      ${infoCard("状态", task.status)}
      ${infoCard("结果码", task.result_code)}
      ${infoCard("回调状态", task.callback_status || "未回调")}
      ${infoCard("回调次数", task.callback_attempts || 0)}
      ${infoCard("错误", task.error_message || "无")}
    </div>
    <div class="detail-block">
      <h3>Description</h3>
      <p>${escapeHtml(task.description || "")}</p>
    </div>
    <div class="detail-block">
      ${renderJsonBlock("video_description_unit", task.video_description_unit)}
      ${renderJsonBlock("personal_tags", task.personal_tags)}
    </div>`;
}

function renderBloggerDetail(task) {
  return `
    <div class="detail-block">
      <h3>博主 ${escapeHtml(shortId(task.tiktok_blogger_id))}</h3>
      <p class="muted">任务 ID ${escapeHtml(task.id || "")}</p>
    </div>
    <div class="tag-grid">
      ${infoCard("状态", task.status)}
      ${infoCard("最少成功视频", task.min_video_count || 15)}
      ${infoCard("可用视频", task.usable_video_count || 0)}
      ${infoCard("成功/失败视频", `${task.successful_video_count || 0}/${task.failed_video_count || 0}`)}
      ${infoCard("已提交补标", task.submitted_video_count || 0)}
      ${infoCard("错误", task.error_message || "无")}
    </div>
    <div class="detail-block">${bloggerProgress(task)}</div>
    ${renderPersonalTags(task.account_personal_tags)}
    <div class="detail-block">
      ${renderJsonBlock("聚合 social_identity", task.aggregated_social_identity)}
      ${renderJsonBlock("聚合 occasion", task.aggregated_occasion)}
      ${renderJsonBlock("选中视频 ID", task.selected_video_ids)}
      ${renderJsonBlock("补标视频任务 ID", task.video_task_ids)}
      ${renderJsonBlock("原始账号输出", task.raw_outputs)}
    </div>`;
}

function renderDetail() {
  const task = tasks.find((item) => taskKey(item) === selectedTaskKey);
  if (!task) {
    $("taskDetail").innerHTML = "选择一条任务查看详情。";
    return;
  }
  $("taskDetail").innerHTML = task.kind === "blogger" ? renderBloggerDetail(task) : renderVideoDetail(task);
}

async function loadTasks() {
  const status = $("statusFilter").value;
  const type = $("typeFilter").value;
  const limit = $("taskLimit").value || 100;
  $("adminStatus").textContent = "读取任务中...";
  const params = new URLSearchParams({ limit });
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const response = await fetch(`/api/v1/tagging/tasks?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || payload.error || "读取失败");
  tasks = normalizeTasks(payload);
  if (!tasks.some((task) => taskKey(task) === selectedTaskKey)) selectedTaskKey = taskKey(tasks[0] || {});
  $("adminStatus").textContent = `已读取 ${tasks.length} 条任务`;
  renderSummary();
  renderRows();
  renderDetail();
}

window.addEventListener("DOMContentLoaded", () => {
  $("refreshTasksBtn").addEventListener("click", () => loadTasks().catch((err) => alert(err.message)));
  $("statusFilter").addEventListener("change", () => loadTasks().catch((err) => alert(err.message)));
  $("typeFilter").addEventListener("change", () => loadTasks().catch((err) => alert(err.message)));
  loadTasks().catch((err) => {
    $("adminStatus").textContent = err.message;
  });
});
