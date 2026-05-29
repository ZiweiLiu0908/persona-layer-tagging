const STYLE_NAMES = [
  "americana", "athleisure", "avant_garde", "bohemian", "casual", "classic", "clean", "coquette",
  "cottagecore", "cozy", "dark_academia", "edgy", "elegant", "gorpcore", "luxe", "minimal",
  "moto", "premium", "preppy", "quiet_luxury", "relaxed", "resort", "romantic", "sport",
  "streetwear", "sustainable", "tailored", "technical", "vintage", "western", "workwear", "y2k",
];

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
  return text.length > 16 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text;
}

function valueText(value) {
  if (value == null || value === "") return "无";
  if (Array.isArray(value)) return value.join("、") || "无";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
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

function infoCard(label, value) {
  return `<div class="info-card"><span>${escapeHtml(label)}</span><b>${escapeHtml(valueText(value))}</b></div>`;
}

function chipList(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (!list.length) return `<span class="empty-chip">无</span>`;
  return list.map((item) => `<span class="data-chip">${escapeHtml(valueText(item))}</span>`).join("");
}

function scalarMeter(label, value) {
  if (value == null || value === "") return "";
  const pct = Math.round(Number(value) * 100);
  return `<div class="scalar-meter"><div><span>${escapeHtml(label)}</span><b>${pct}%</b></div><i><em style="width:${Math.max(0, Math.min(100, pct))}%"></em></i></div>`;
}

function fieldLine(label, value) {
  return `<div class="field-line"><span>${escapeHtml(label)}</span><b>${escapeHtml(valueText(value))}</b></div>`;
}

function signaturePanel(title, fields) {
  return `<article class="signature-panel"><h4>${escapeHtml(title)}</h4><div class="signature-fields">${fields.join("")}</div></article>`;
}

function vectorEntries(vector) {
  return STYLE_NAMES.map((name) => [name, Number(vector?.[name] || 0)]);
}

function renderStyleVectorFull(vector) {
  if (!vector) return "";
  const entries = vectorEntries(vector);
  const max = Math.max(...entries.map(([, value]) => value), 0.01);
  return `<section class="detail-section">
    <h3>32 风格向量</h3>
    <div class="style-vector-grid">${entries.map(([name, value]) => {
      const pct = Math.round(value * 100);
      const width = Math.max(3, Math.round((value / max) * 100));
      return `<div class="mini-style"><div><b>${escapeHtml(name)}</b><span>${pct}%</span></div><i><em style="width:${width}%"></em></i></div>`;
    }).join("")}</div>
  </section>`;
}

function renderOccasionVector(vector) {
  const entries = Object.entries(vector || {});
  if (!entries.length) return "";
  return signaturePanel("OccasionVector", entries.map(([name, value]) => scalarMeter(name, value)));
}

function renderSignatureFull(signature) {
  if (!signature) return "";
  const color = signature.color_palette || {};
  const material = signature.material_profile || {};
  const silhouette = signature.silhouette_profile || {};
  const pattern = signature.pattern_profile || {};
  const mood = signature.aesthetic_mood || {};
  const price = signature.price_positioning || {};
  const era = signature.era_influence || {};
  return `<section class="detail-section">
    <h3>StyleSignature 8 Facets</h3>
    <div class="signature-grid">
      ${signaturePanel("ColorPalette", [
        fieldLine("主色", color.dominant_colors),
        fieldLine("温度/饱和/对比", [color.temperature, color.saturation, color.contrast].filter(Boolean)),
        fieldLine("招牌搭配", color.signature_combos),
        scalarMeter("单色倾向", color.monochromatic_tendency),
      ])}
      ${signaturePanel("MaterialProfile", [
        fieldLine("主材质", material.primary_materials),
        fieldLine("纹理/重量/透明", [material.texture_preference, material.weight_preference, material.transparency_level].filter(Boolean)),
        scalarMeter("金属配件偏好", material.hardware_affinity),
      ])}
      ${signaturePanel("SilhouetteProfile", [
        fieldLine("版型", silhouette.fit_preference),
        fieldLine("比例", silhouette.proportion_play),
        fieldLine("结构", silhouette.structure_level),
        fieldLine("长度偏好", silhouette.length_preference),
        fieldLine("层次", silhouette.layering_complexity),
      ])}
      ${signaturePanel("PatternProfile", [
        fieldLine("图案", pattern.pattern_types),
        fieldLine("尺度/Logo", [pattern.pattern_scale, pattern.logo_visibility].filter(Boolean)),
        scalarMeter("图案频率", pattern.pattern_frequency),
        fieldLine("混搭印花", pattern.print_mixing === true ? "是" : pattern.print_mixing === false ? "否" : "无"),
      ])}
      ${signaturePanel("AestheticMood", [
        fieldLine("能量", mood.energy),
        fieldLine("正式度", mood.formality_range),
        fieldLine("性别表达", mood.gender_expression),
        fieldLine("文化锚点", mood.cultural_references),
        fieldLine("关键词", mood.mood_keywords),
      ])}
      ${renderOccasionVector(signature.occasion_vector)}
      ${signaturePanel("PricePositioning", [
        fieldLine("价格层级", price.tier),
        scalarMeter("投资 vs 潮流", price.investment_vs_trend),
        scalarMeter("品牌意识", price.brand_consciousness),
      ])}
      ${signaturePanel("EraInfluence", [
        fieldLine("时代", era.primary_era),
        fieldLine("真实度", era.era_authenticity),
        scalarMeter("复古未来感", era.retro_futurism),
      ])}
    </div>
  </section>`;
}

function renderTagObject(title, object) {
  if (!object) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="tag-panel">${Object.entries(object).map(([key, value]) =>
    `<div class="tag-row"><span>${escapeHtml(key)}</span><div>${chipList(Array.isArray(value) ? value : typeof value === "object" && value !== null ? Object.entries(value).map(([k, v]) => `${k}: ${valueText(v)}`) : [value])}</div></div>`
  ).join("")}</div></section>`;
}

function linkBlock(label, url) {
  if (!url) return "";
  return `<div class="link-block"><span>${escapeHtml(label)}</span><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>`;
}

async function getSignedUrl(videoId) {
  const payload = await parseResponse(await fetch(`/api/v1/videos/signed-url/${videoId}`));
  return payload.data?.signed_gcs_url || "";
}

async function renderVideoDetail(task) {
  const signedUrl = await getSignedUrl(task.video_id).catch(() => "");
  $("detailTitle").textContent = `视频 ${shortId(task.video_id)}`;
  $("detailSubtitle").textContent = "单视频完整打标结果";
  $("detailContent").className = "task-list-panel detail-page-content";
  $("detailContent").innerHTML = `<section class="detail-section">
      <h3>视频 ${escapeHtml(shortId(task.video_id))}</h3>
      <p class="muted">任务 ID ${escapeHtml(task.id || "")}</p>
      ${linkBlock("原始 GCS URL", task.gcs_url)}
      ${linkBlock("新签名 GCS URL", signedUrl)}
    </section>
    <section class="detail-section"><div class="info-grid">
      ${infoCard("状态", task.status)}
      ${infoCard("结果码", task.result_code)}
      ${infoCard("错误", task.error_message || "无")}
      ${infoCard("回调", task.callback_status || "未回调")}
      ${infoCard("创建时间", formatDate(task.created_at))}
      ${infoCard("更新时间", formatDate(task.updated_at))}
    </div></section>
    <section class="detail-section"><h3>Description</h3><p>${escapeHtml(task.description || "无")}</p></section>
    ${renderTagObject("video_description_unit", task.video_description_unit)}
    ${renderTagObject("10 属性", task.personal_tags)}
    ${renderStyleVectorFull(task.style_vector)}
    ${renderSignatureFull(task.style_signature)}`;
}

async function renderBloggerDetail(task) {
  $("detailTitle").textContent = `博主 ${shortId(task.tiktok_blogger_id)}`;
  $("detailSubtitle").textContent = "博主完整打标与聚合结果";
  $("detailContent").className = "task-list-panel detail-page-content";
  $("detailContent").innerHTML = `<section class="detail-section">
      <h3>博主 ${escapeHtml(shortId(task.tiktok_blogger_id))}</h3>
      <p class="muted">任务 ID ${escapeHtml(task.id || "")}</p>
      <p class="detail-actions"><a class="nav-button secondary" href="/blogger-videos.html?blogger_id=${encodeURIComponent(task.tiktok_blogger_id)}">查看该博主视频任务</a></p>
    </section>
    <section class="detail-section"><div class="info-grid">
      ${infoCard("状态", task.status)}
      ${infoCard("最少成功视频", task.min_video_count || 15)}
      ${infoCard("可用视频", task.usable_video_count || 0)}
      ${infoCard("成功/失败视频", `${task.successful_video_count || 0}/${task.failed_video_count || 0}`)}
      ${infoCard("补标任务", task.submitted_video_count || 0)}
      ${infoCard("错误", task.error_message || "无")}
      ${infoCard("创建时间", formatDate(task.created_at))}
      ${infoCard("更新时间", formatDate(task.updated_at))}
    </div></section>
    ${renderTagObject("账号最终属性", task.account_personal_tags)}
    ${renderTagObject("聚合 social_identity", task.aggregated_social_identity)}
    ${renderTagObject("聚合 occasion", task.aggregated_occasion)}
    ${renderStyleVectorFull(task.account_style_vector)}
    ${renderSignatureFull(task.account_style_signature)}`;
}

async function loadDetail() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const id = params.get("id");
  if (!type || !id) throw new Error("缺少 type 或 id");
  if (type === "video") {
    const payload = await parseResponse(await fetch(`/api/v1/videos/tag/${id}`));
    await renderVideoDetail(payload.data);
  } else if (type === "blogger") {
    const payload = await parseResponse(await fetch(`/api/v1/bloggers/tag/${id}`));
    await renderBloggerDetail(payload.data);
  } else {
    throw new Error("未知任务类型");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", () => window.location.reload());
  loadDetail().catch((error) => {
    $("detailContent").className = "task-list-panel detail-page-content empty-state";
    $("detailContent").textContent = error.message;
    setMessage("error", error.message);
  });
});
