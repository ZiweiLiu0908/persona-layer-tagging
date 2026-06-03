let activeKind = "video";
let videoTasks = [];
let bloggerTasks = [];

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
  if (status === "waiting_videos" || status === "pending") return "waiting";
  if (status === "running" || status === "checking_videos" || status === "aggregating") return "running";
  return "neutral";
}

function setHealth(apiState, dbState, message = "") {
  $("apiStatus").className = `health-pill ${apiState}`;
  $("apiStatus").textContent = apiState === "ok" ? "API 正常" : apiState === "bad" ? "API 异常" : "API 检查中";
  $("dbStatus").className = `health-pill ${dbState}`;
  $("dbStatus").textContent = dbState === "ok" ? "DB 正常" : dbState === "bad" ? "DB 异常" : "DB 检查中";
  $("serviceSubtitle").textContent = message || "视频打标任务、博主打标任务、结果详情监控";
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    throw new Error(payload.message || payload.error || "请求失败");
  }
  return payload;
}

function renderSummary(targetId, tasks, label) {
  const counts = tasks.reduce((acc, task) => {
    acc.total += 1;
    acc[task.status] = (acc[task.status] || 0) + 1;
    if (task.callback_status === "failed") acc.callbackFailed += 1;
    return acc;
  }, { total: 0, callbackFailed: 0 });
  const running = (counts.running || 0) + (counts.checking_videos || 0) + (counts.waiting_videos || 0) + (counts.aggregating || 0);
  const cards = [
    [label, counts.total, "当前日期筛选"],
    ["运行/等待", running, "含 pending/running"],
    ["成功", counts.success || 0, "可读取结果"],
    ["失败/回调失败", `${counts.failed || 0}/${counts.callbackFailed}`, "任务失败 / 回调失败"],
  ];
  $(targetId).innerHTML = cards.map(([title, value, note]) => `<article class="summary-card">
    <span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p>
  </article>`).join("");
}

function videoProgress(task) {
  const stages = [
    ["描述", task.video_description_unit],
    ["10属性", task.personal_tags],
    ["32风格", task.style_vector],
    ["风格指纹", task.style_signature],
  ];
  const done = stages.filter(([, value]) => Boolean(value)).length;
  return `<div class="stage-list">${stages.map(([label, value]) => `<span class="${value ? "done" : ""}">${escapeHtml(label)}</span>`).join("")}</div>
  <p class="muted">${done}/4 阶段</p>`;
}

function bloggerProgress(task) {
  const min = Number(task.min_video_count || 15);
  const success = Number(task.successful_video_count || 0);
  const percent = Math.min(100, Math.round((success / Math.max(min, 1)) * 100));
  return `<div class="progress-top"><span>${success}/${min} 成功视频</span><b>${percent}%</b></div>
  <div class="progress-track"><span style="width:${percent}%"></span></div>
  <p class="muted">可用 ${escapeHtml(task.usable_video_count || 0)} · 补标 ${escapeHtml(task.submitted_video_count || 0)} · 失败 ${escapeHtml(task.failed_video_count || 0)}</p>`;
}

function detailUrl(kind, task) {
  const id = kind === "video" ? task.video_id : task.tiktok_blogger_id;
  return `/task-detail.html?type=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
}

function bloggerVideosUrl(task) {
  return `/blogger-videos.html?blogger_id=${encodeURIComponent(task.tiktok_blogger_id)}`;
}

function rowLink(label, url) {
  if (!url) return "";
  return `<a class="table-link row-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}：${escapeHtml(url)}</a>`;
}

function bloggerTikTokLinks(task) {
  const videoUrls = Array.isArray(task.source_video_urls) ? task.source_video_urls.filter(Boolean) : [];
  const count = Number(task.source_video_count || videoUrls.length);
  const homepage = rowLink("原主页", task.blogger_url);
  const videos = videoUrls.map((url, index) => rowLink(`原视频 ${index + 1}`, url)).join("");
  const more = count > videoUrls.length ? `<span class="table-link muted">共 ${escapeHtml(count)} 个原视频，当前展示 ${escapeHtml(videoUrls.length)} 个</span>` : "";
  return homepage || videos ? `${homepage}${videos}${more}` : `<span class="muted">无</span>`;
}

function renderTaskRows(targetId, tasks, kind) {
  if (!tasks.length) {
    $(targetId).innerHTML = `<tr><td colspan="${kind === "video" ? "5" : "7"}" class="empty-row">当天暂无${kind === "video" ? "视频" : "博主"}任务。</td></tr>`;
    return;
  }
  $(targetId).innerHTML = tasks.map((task) => {
    const isVideo = kind === "video";
    const title = isVideo ? `视频 ${shortId(task.video_id)}` : `博主 ${shortId(task.tiktok_blogger_id)}`;
    const progress = isVideo ? videoProgress(task) : bloggerProgress(task);
    return `<tr class="clickable-row" data-detail-url="${escapeHtml(detailUrl(kind, task))}">
      <td><span class="kind-chip">${isVideo ? "视频" : "博主"}</span><b>${escapeHtml(title)}</b>
        ${isVideo && task.gcs_url ? `<span class="table-link">${escapeHtml(task.gcs_url)}</span>` : ""}
      </td>
      ${isVideo ? "" : `<td>${bloggerTikTokLinks(task)}</td>`}
      <td><span class="status-pill ${statusClass(task.status)}">${escapeHtml(task.status || "-")}</span><p class="muted">${escapeHtml(task.result_message || task.error_message || "")}</p></td>
      <td>${progress}</td>
      <td><span class="status-pill ${statusClass(task.callback_status)}">${escapeHtml(task.callback_status || "未回调")}</span><p class="muted">${escapeHtml(task.callback_response_code || "")}</p></td>
      <td><p class="muted">创建 ${escapeHtml(formatDate(task.created_at))}</p><p class="muted">更新 ${escapeHtml(formatDate(task.updated_at))}</p></td>
      ${isVideo ? "" : `<td class="action-cell"><button class="secondary small blogger-video-btn" type="button" data-videos-url="${escapeHtml(bloggerVideosUrl(task))}">视频任务</button></td>`}
    </tr>`;
  }).join("");
  document.querySelectorAll(`#${targetId} .clickable-row`).forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href = row.dataset.detailUrl;
    });
  });
  document.querySelectorAll(`#${targetId} .blogger-video-btn`).forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.location.href = button.dataset.videosUrl;
    });
  });
  document.querySelectorAll(`#${targetId} .row-link`).forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
}

function switchKind(kind) {
  activeKind = kind;
  $("videoTaskPanel").hidden = kind !== "video";
  $("bloggerTaskPanel").hidden = kind !== "blogger";
  $("videoTabBtn").classList.toggle("active", kind === "video");
  $("bloggerTabBtn").classList.toggle("active", kind === "blogger");
}

function renderAll() {
  renderSummary("videoSummaryCards", videoTasks, "视频任务");
  renderSummary("bloggerSummaryCards", bloggerTasks, "博主任务");
  renderTaskRows("videoTaskRows", videoTasks, "video");
  renderTaskRows("bloggerTaskRows", bloggerTasks, "blogger");
  switchKind(activeKind);
}

async function loadVideoTasks() {
  const params = new URLSearchParams({ limit: $("videoLimit").value || "100" });
  if ($("videoStatusFilter").value) params.set("status", $("videoStatusFilter").value);
  if ($("videoDateFilter").value) params.set("date", $("videoDateFilter").value);
  const payload = await parseResponse(await fetch(`/api/v1/video-tagging/tasks?${params.toString()}`));
  videoTasks = (payload.data?.tasks || []).map((task) => ({ ...task, kind: "video" }));
}

async function loadBloggerTasks() {
  const params = new URLSearchParams({ limit: $("bloggerLimit").value || "100" });
  if ($("bloggerStatusFilter").value) params.set("status", $("bloggerStatusFilter").value);
  if ($("bloggerDateFilter").value) params.set("date", $("bloggerDateFilter").value);
  const payload = await parseResponse(await fetch(`/api/v1/blogger-tagging/tasks?${params.toString()}`));
  bloggerTasks = (payload.data?.tasks || []).map((task) => ({ ...task, kind: "blogger" }));
}

async function loadTasks() {
  try {
    await Promise.all([loadVideoTasks(), loadBloggerTasks()]);
    setHealth("ok", "ok");
    renderAll();
    setMessage("", "");
  } catch (error) {
    videoTasks = [];
    bloggerTasks = [];
    setHealth("ok", "bad", error.message);
    renderAll();
    setMessage("error", error.message);
  }
}

function bindEvents() {
  $("refreshBtn").addEventListener("click", loadTasks);
  $("videoTabBtn").addEventListener("click", () => switchKind("video"));
  $("bloggerTabBtn").addEventListener("click", () => switchKind("blogger"));
  ["videoDateFilter", "videoStatusFilter", "videoLimit"].forEach((id) => {
    $(id).addEventListener("change", loadTasks);
  });
  ["bloggerDateFilter", "bloggerStatusFilter", "bloggerLimit"].forEach((id) => {
    $(id).addEventListener("change", loadTasks);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  $("videoDateFilter").value = todayBeijing();
  $("bloggerDateFilter").value = todayBeijing();
  bindEvents();
  loadTasks();
});
