// ===== Sage Wiki Plus — SPA Frontend =====
'use strict';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const toast = $('#toast');

let currentPage = 'dashboard';
let articleCache = {};

// ---- Utils ----
async function api(path, opts) {
  opts = opts || {};
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
  const ct = r.headers.get('content-type') || '';
  return ct.indexOf('json') >= 0 ? r.json() : r.text();
}
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function() { toast.classList.remove('show'); }, 2500);
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function escapeHtml(s) {
  return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}
// Minimal Markdown renderer
function md2html(md) {
  var h = escapeHtml(md);
  h = h.replace(/```([\s\S]*?)```/g, function(m, c) { return '<pre>' + c + '</pre>'; });
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // table rows
  h = h.replace(/^\|(.+)\|$/gm, function(m, row) {
    var cells = row.split('|').map(function(c){return c.trim();}).filter(function(c){return c.length>0;});
    if (cells.every(function(c){return /^-+$/.test(c);})) return '';
    return '<tr>' + cells.map(function(c){return '<td>'+c+'</td>';}).join('') + '</tr>';
  });
  h = h.replace(/(<tr>[\s\S]*?<\/tr>\s*)+/g, function(m) { return '<table>' + m + '</table>'; });
  h = h.replace(/^\- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  h = h.replace(/<\/ul>\s*<ul>/g, '');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  h = h.replace(/\n{2,}/g, '</p><p>');
  h = '<p>' + h + '</p>';
  h = h.replace(/<p>\s*<(h[123]|pre|table|ul)/g, '<$1');
  h = h.replace(/<\/(h[123]|pre|table|ul)>\s*<\/p>/g, '</$1>');
  return h;
}

// ---- Navigation ----
document.querySelectorAll('.nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    var page = el.dataset.page;
    if (page === currentPage) return;
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    el.classList.add('active');
    currentPage = page;
    renderPage(page);
  });
});

function renderPage(page) {
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'articles': renderArticles(); break;
    case 'search': renderSearch(); break;
    case 'upload': renderUpload(); break;
    case 'settings': renderSettings(); break;
  }
}

// ---- Dashboard ----
async function renderDashboard() {
  app.innerHTML =
    '<div class="topbar"><h1>📊 仪表盘</h1><div class="sub">Sage Wiki Plus 知识库概览</div></div>' +
    '<div class="card"><div class="stats" id="stats"><div class="loading">加载中...</div></div></div>' +
    '<div class="card"><div style="font-size:15px;font-weight:600;margin-bottom:10px">📚 源文件</div><div id="sources"><div class="loading">加载中...</div></div></div>' +
    '<div class="card"><div style="font-size:15px;font-weight:600;margin-bottom:10px">⚙️ 快捷操作</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn outline" style="width:auto;flex:1;min-width:120px" onclick="doCompile()">🚀 编译Wiki</button>' +
    '<button class="btn outline" style="width:auto;flex:1;min-width:120px" onclick="document.querySelector(\\'.nav-item[data-page=articles]\\').click()">📖 浏览文章</button>' +
    '</div></div>';
  try {
    var results = await Promise.all([api('/api/status'), api('/api/sources')]);
    var status = results[0], sources = results[1];
    var statsEl = $('#stats');
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="stat-item"><div class="val">' + (status.entries || 0) + '</div><div class="lbl">索引条目</div></div>' +
        '<div class="stat-item"><div class="val">' + (status.entities || 0) + '</div><div class="lbl">实体</div></div>' +
        '<div class="stat-item"><div class="val">' + (status.vectors || 0) + '</div><div class="lbl">向量</div></div>' +
        '<div class="stat-item"><div class="val">' + (status.relations || 0) + '</div><div class="lbl">关系</div></div>';
    }
    var srcs = sources.sources || [];
    var sEl = $('#sources');
    if (sEl) {
      sEl.innerHTML = srcs.length ? srcs.map(function(s) {
        return '<div class="source-item"><span class="name">' + escapeHtml(s.name) + '</span><span class="size">' + fmtSize(s.size) + '</span></div>';
      }).join('') : '<div style="color:var(--dim);font-size:13px">暂无源文件</div>';
    }
  } catch (e) {
    var st = $('#stats');
    if (st) st.innerHTML = '<div style="color:#ff5c6c">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}

// ---- Articles ----
async function renderArticles() {
  app.innerHTML =
    '<div class="topbar"><h1>📖 文章</h1><div class="sub">浏览 Wiki 概念和摘要</div></div>' +
    '<div class="article-tab" id="tabs"><button class="active" data-tab="concepts">概念</button><button data-tab="summaries">摘要</button></div>' +
    '<div id="articleList"><div class="loading">加载中...</div></div>';
  document.querySelectorAll('#tabs button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#tabs button').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      loadArticleList(btn.dataset.tab);
    });
  });
  try {
    var tree = await api('/api/tree');
    window._treeData = tree;
    loadArticleList('concepts', tree);
  } catch (e) {
    var el = $('#articleList');
    if (el) el.innerHTML = '<div style="color:#ff5c6c">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}

function loadArticleList(tab, data) {
  if (!data) data = window._treeData;
  if (!data) return;
  var items = data[tab] || [];
  var el = $('#articleList');
  if (!el) return;
  el.innerHTML = items.length ? items.map(function(item) {
    return '<div class="article-list-item" onclick="viewArticle(\'' + escapeHtml(item.path) + '\',\'' + escapeHtml(item.name) + '\')"><div class="name">' + escapeHtml(item.name) + '</div></div>';
  }).join('') : '<div style="padding:20px;text-align:center;color:var(--dim)">暂无内容</div>';
}

async function viewArticle(path, name) {
  app.innerHTML =
    '<div class="topbar"><h1>📖 ' + escapeHtml(name) + '</h1><div class="sub">' + escapeHtml(path) + '</div></div>' +
    '<div class="article-view"><span class="back" onclick="renderArticles()">← 返回列表</span><div class="article-content" id="articleContent"><div class="loading">加载中...</div></div></div>';
  try {
    if (articleCache[path]) {
      var el1 = $('#articleContent');
      if (el1) el1.innerHTML = md2html(articleCache[path]);
      return;
    }
    var content = await api('/api/articles/' + encodeURIComponent(path));
    articleCache[path] = content;
    var el2 = $('#articleContent');
    if (el2) el2.innerHTML = md2html(content);
  } catch (e) {
    var el3 = $('#articleContent');
    if (el3) el3.innerHTML = '<div style="color:#ff5c6c">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}

// ---- Search ----
function renderSearch() {
  app.innerHTML =
    '<div class="topbar"><h1>🔍 搜索</h1><div class="sub">混合检索 Wiki 知识</div></div>' +
    '<div class="search-bar"><input id="searchInput" type="text" placeholder="输入关键词..." /><button onclick="doSearch()">搜索</button></div>' +
    '<div id="searchResults"></div>';
  var input = $('#searchInput');
  if (input) {
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(); });
    input.focus();
  }
}

async function doSearch() {
  var q = $('#searchInput') ? $('#searchInput').value.trim() : '';
  if (!q) return;
  var el = $('#searchResults');
  if (!el) return;
  el.innerHTML = '<div class="loading">搜索中...</div>';
  try {
    var data = await api('/api/search?q=' + encodeURIComponent(q));
    var results = data.results || [];
    el.innerHTML = results.length ? results.map(function(r) {
      return '<div class="search-result" onclick="viewArticle(\'' + escapeHtml(r.path) + '\',\'' + escapeHtml(r.id) + '\')">' +
        '<div class="title">' + escapeHtml(r.id) + '</div>' +
        '<div class="snippet">' + escapeHtml(r.snippet || '') + '</div>' +
        '<div class="score">相关度: ' + (r.score * 100).toFixed(1) + '%</div></div>';
    }).join('') : '<div style="padding:20px;text-align:center;color:var(--dim)">无结果</div>';
  } catch (e) {
    el.innerHTML = '<div style="color:#ff5c6c">搜索失败: ' + escapeHtml(e.message) + '</div>';
  }
}

// ---- Upload ----
function renderUpload() {
  app.innerHTML =
    '<div class="topbar"><h1>📤 上传</h1><div class="sub">添加源文件到 Wiki</div></div>' +
    '<div class="upload-zone" id="dropZone"><div class="icon">📁</div><div class="text">点击选择或拖放文件到此处<br><strong>支持 .txt .md .pdf .json .go .py 等</strong></div></div>' +
    '<input type="file" id="fileInput" multiple style="display:none" />' +
    '<div id="uploadResult"></div>';
  var dz = $('#dropZone'), fi = $('#fileInput');
  if (dz && fi) {
    dz.addEventListener('click', function() { fi.click(); });
    fi.addEventListener('change', function() { handleFiles(fi.files); });
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
    dz.addEventListener('dragleave', function() { dz.style.borderColor = ''; });
    dz.addEventListener('drop', function(e) { e.preventDefault(); dz.style.borderColor = ''; handleFiles(e.dataTransfer.files); });
  }
}

async function handleFiles(files) {
  if (!files.length) return;
  var el = $('#uploadResult');
  if (el) el.innerHTML = '<div class="card">上传中...</div>';
  var fd = new FormData();
  for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
  try {
    var r = await fetch('/api/sources/upload', { method: 'POST', body: fd });
    var result = await r.json().catch(function() { return {}; });
    if (r.ok) {
      if (el) el.innerHTML = '<div class="card" style="border-color:var(--accent)">✅ 上传成功！' + escapeHtml(result.message || JSON.stringify(result)) + '</div>';
      showToast('上传成功');
    } else {
      if (el) el.innerHTML = '<div class="card" style="border-color:#ff5c6c">❌ 上传失败: ' + escapeHtml(result.error || r.statusText) + '</div>';
    }
  } catch (e) {
    if (el) el.innerHTML = '<div class="card" style="border-color:#ff5c6c">❌ 错误: ' + escapeHtml(e.message) + '</div>';
  }
}

// ---- Settings ----
async function renderSettings() {
  app.innerHTML =
    '<div class="topbar"><h1>⚙️ 设置</h1><div class="sub">配置 LLM 和 Embedding 模型</div></div>' +
    '<div class="card">' +
    '<div class="settings-group"><div class="label">LLM 模型</div><input id="cfgLLM" type="text" placeholder="模型名称" /></div>' +
    '<div class="settings-group"><div class="label">Embedding 模型</div><input id="cfgEmbed" type="text" placeholder="嵌入模型名称" /></div>' +
    '<div class="settings-group"><div class="label">API Base URL</div><input id="cfgBaseURL" type="text" placeholder="https://..." /></div>' +
    '<button class="btn" onclick="saveConfig()">💾 保存配置</button></div>' +
    '<div class="card">' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:10px">🚀 编译</div>' +
    '<button class="btn" onclick="doCompile()">▶️ 开始编译</button>' +
    '<div class="compile-log" id="compileLog" style="display:none"></div></div>';
  try {
    var cfg = await api('/api/config');
    var el1 = $('#cfgLLM'); if (el1) el1.value = (cfg.Models && cfg.Models.Summarize) || '';
    var el2 = $('#cfgEmbed'); if (el2) el2.value = (cfg.Embed && cfg.Embed.Model) || '';
    var el3 = $('#cfgBaseURL'); if (el3) el3.value = (cfg.API && cfg.API.BaseURL) || '';
  } catch (e) {
    showToast('加载配置失败');
  }
}

async function saveConfig() {
  var body = {
    llm_model: $('#cfgLLM') ? $('#cfgLLM').value : '',
    embedding_model: $('#cfgEmbed') ? $('#cfgEmbed').value : '',
    api_base_url: $('#cfgBaseURL') ? $('#cfgBaseURL').value : ''
  };
  try {
    await api('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    showToast('配置已保存');
  } catch (e) {
    showToast('保存失败: ' + e.message);
  }
}

async function doCompile() {
  var logEl = $('#compileLog');
  if (!logEl) {
    logEl = document.createElement('div');
    logEl.id = 'compileLog';
    logEl.className = 'compile-log';
    var cards = document.querySelectorAll('.card');
    if (cards.length > 1) cards[cards.length - 1].appendChild(logEl);
  }
  logEl.style.display = 'block';
  logEl.textContent = '编译启动中...\n';
  showToast('编译任务已启动');
  try {
    var result = await api('/api/compile', { method: 'POST' });
    logEl.textContent = '编译完成\n' + JSON.stringify(result, null, 2);
    showToast('编译完成');
  } catch (e) {
    logEl.textContent += '错误: ' + e.message + '\n';
    showToast('编译失败');
  }
}

// ---- Init ----
renderPage('dashboard');
