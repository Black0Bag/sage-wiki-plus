// ===== Sage Wiki Plus — SPA =====
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const app = $('#app');
const toast = $('#toast');

let page = 'dashboard';
let cache = {};

// ---- API ---- //
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const r = await fetch(path, opts);
  const ct = r.headers.get('content-type') || '';
  const isJson = ct.includes('json');
  const data = isJson ? await r.json() : await r.text();
  if (!r.ok) throw new Error(typeof data === 'object' ? (data.message || data.error || r.statusText) : data);
  return data;
}
function get(path) { return api('GET', path); }
function post(path, data) { return api('POST', path, data); }

function msg(s) {
  toast.textContent = s;
  toast.classList.add('show');
  clearTimeout(msg._t);
  msg._t = setTimeout(() => toast.classList.remove('show'), 2500);
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function size(n) { if(n<1024) return n+'B'; if(n<1048576) return (n/1024).toFixed(1)+'KB'; return (n/1048576).toFixed(1)+'MB'; }
function date(s) { try{return new Date(s).toLocaleDateString('zh-CN')}catch(e){return s} }

// ---- Markdown renderer ---- //
function md(html) {
  return html
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^>- (.+)$/gm, '<blockquote><li>$1</li></blockquote>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\|(.+)\|$/gm, function(m,row) {
      const c = row.split('|').map(x=>x.trim()).filter(Boolean);
      if (!c.length || /^-+$/.test(c[0])) return '';
      return '<tr>'+c.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
    })
    .replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table>$1</table>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g,'')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(.+)$/gm, function(m){
      if(/^<(\/)?(h[123]|pre|table|ul|ol|li|blockquote)/.test(m)||/^<table/.test(m)||!m.trim()) return m;
      return m;
    });
}

// ---- Router ---- //
function navigate(name) {
  if (name === page) return;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === name));
  page = name;
  render();
}

function render() {
  switch(page) {
    case 'dashboard': dashboard(); break;
    case 'articles': articles(); break;
    case 'search': search(); break;
    case 'graph': graph(); break;
    case 'upload': upload(); break;
    case 'settings': settings(); break;
  }
}

// ==================== DASHBOARD ==================== //
async function dashboard() {
  app.innerHTML = `
    <div class="topbar"><h1>📊 仪表盘</h1><div class="sub">Sage Wiki Plus 知识库总览</div></div>
    <div class="card"><div class="card-title">📈 统计</div><div class="stats" id="stats"><div class="spinner"></div></div></div>
    <div class="card"><div class="card-title">📄 源文件 <span style="color:var(--fg3);font-weight:400;font-size:12px" id="srcCount"></span></div><div id="sources"><div class="spinner"></div></div></div>
    <div class="card">
      <div class="card-title">⚡ 快捷操作</div>
      <div class="btn-group">
        <button class="btn" onclick="doCompile()">🚀 编译</button>
        <button class="btn btn-outline" onclick="navigate('upload')">📤 上传源文件</button>
        <button class="btn btn-outline" onclick="navigate('articles')">📖 浏览文章</button>
        <button class="btn btn-outline" onclick="navigate('graph')">🔗 知识图谱</button>
      </div>
    </div>
    <div id="compileStatus"></div>`;
  try {
    const [status, sources] = await Promise.all([get('/api/status'), get('/api/sources')]);
    const s = $('#stats');
    if(s) s.innerHTML = `
      <div class="stat-item"><div class="val">${status.entries||0}</div><div class="lbl">条目</div></div>
      <div class="stat-item"><div class="val">${status.entities||0}</div><div class="lbl">实体</div></div>
      <div class="stat-item"><div class="val">${status.vectors||0}</div><div class="lbl">向量</div></div>
      <div class="stat-item"><div class="val">${status.relations||0}</div><div class="lbl">关系</div></div>`;
    const sc = $('#srcCount');
    if(sc && sources.sources) sc.textContent = `(${sources.sources.length})`;
    const sl = $('#sources');
    if(sl && sources.sources) {
      if(!sources.sources.length) {
        sl.innerHTML = '<div class="empty"><span class="ico">📂</span><p>暂无源文件，上传或添加源文件开始构建知识库</p></div>';
      } else {
        sl.innerHTML = sources.sources.map(s => `
          <div class="source-item"><span class="name">${esc(s.name)}</span><span class="size">${size(s.size)}</span></div>
        `).join('');
      }
    }
  } catch(e) {
    const s = $('#stats'); if(s) s.innerHTML = `<div style="color:var(--red);font-size:14px">❌ ${esc(e.message)}</div>`;
  }
}

async function doCompile() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = '⏳ 编译中...';
  const cs = $('#compileStatus');
  if(cs) cs.innerHTML = '<div class="card"><div class="spinner"></div><div class="loading-text">正在编译，请稍候...</div></div>';
  try {
    const r = await post('/api/compile');
    msg(r.message || '编译已启动');
    setTimeout(() => { btn.disabled = false; btn.textContent = '🚀 编译'; if(cs) cs.innerHTML = ''; }, 2000);
  } catch(e) {
    msg('编译失败: '+e.message);
    btn.disabled = false; btn.textContent = '🚀 编译';
    if(cs) cs.innerHTML = '';
  }
}

// ==================== ARTICLES ==================== //
let treeData = null;
let tabFilter = 'concepts';

async function articles() {
  app.innerHTML = `
    <div class="topbar"><h1>📖 文章</h1><div class="sub">浏览 Wiki 知识库文章</div></div>
    <div class="article-tab" id="tabs">
      <button class="${tabFilter==='concepts'?'active':''}" data-tab="concepts">📝 概念</button>
      <button class="${tabFilter==='summaries'?'active':''}" data-tab="summaries">📋 摘要</button>
      <button class="${tabFilter==='sources'?'active':''}" data-tab="sources">📄 源文件</button>
    </div>
    <div id="articleList"><div class="spinner"></div></div>`;
  $$('#tabs button').forEach(btn => btn.addEventListener('click', () => {
    $$('#tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tabFilter = btn.dataset.tab;
    renderArticleList();
  }));
  if (!treeData) {
    try { treeData = await get('/api/tree'); } catch(e) { treeData = {concepts:[],summaries:[],sources:[]}; }
  }
  renderArticleList();
}

function renderArticleList() {
  const items = treeData[tabFilter] || [];
  const el = $('#articleList');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="empty"><span class="ico">📭</span><p>暂无内容</p></div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="article-list-item" onclick="viewArticle('${esc(item.path)}')">
      <div class="name">${esc(item.name)}</div>
      ${item.type ? `<span class="tag">${esc(item.type)}</span>` : ''}
    </div>
  `).join('');
}

async function viewArticle(path) {
  app.innerHTML = `
    <div class="topbar">
      <h1>📖 ${esc(path.split('/').pop().replace(/\.md$/,''))}</h1>
      <div class="sub">${esc(path)}</div>
    </div>
    <div class="article-view">
      <span class="back-link" onclick="articles()">← 返回文章列表</span>
      <div class="card"><div class="article-content" id="articleContent"><div class="spinner"></div></div></div>
    </div>`;
  try {
    if (!cache[path]) cache[path] = await get('/api/articles/'+encodeURIComponent(path));
    const el = $('#articleContent');
    if(el) el.innerHTML = '<div class="article-content">'+md(cache[path])+'</div>';
  } catch(e) {
    const el = $('#articleContent');
    if(el) el.innerHTML = `<div style="color:var(--red);padding:12px">❌ ${esc(e.message)}</div>`;
  }
}

// ==================== SEARCH ==================== //
function search() {
  app.innerHTML = `
    <div class="topbar"><h1>🔍 搜索</h1><div class="sub">混合检索 Wiki 知识库</div></div>
    <div class="search-bar">
      <input id="q" type="text" placeholder="输入关键词搜索知识库..." autofocus>
      <button onclick="doSearch()">搜索</button>
    </div>
    <div id="results"></div>`;
  const q = $('#q');
  if(q) { q.addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); }); q.focus(); }
}

async function doSearch() {
  const q = $('#q');
  if (!q || !q.value.trim()) return;
  const el = $('#results');
  if (!el) return;
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await post('/api/search', { query: q.value.trim(), limit: 20 });
    const results = data.results || [];
    if (!results.length) {
      el.innerHTML = '<div class="empty"><span class="ico">🔍</span><p>没有找到匹配结果</p></div>';
      return;
    }
    el.innerHTML = results.map(r => {
      const tags = r.Tags ? r.Tags.map(t => `<span class="tag">${esc(t)}</span>`).join('') : '';
      const type = r.ID && r.ID.startsWith('concept:') ? '概念' : r.ID && r.ID.startsWith('raw/') ? '源文件' : '文章';
      return `<div class="search-result" onclick="viewArticle('${esc(r.ID.replace(/^concept:/,'wiki/concepts/').replace(/^raw\//,'wiki/summaries/raw-'))}')">
        <div class="title">${esc(r.Title || r.ID)}</div>
        <div class="snippet">${esc((r.Content||'').slice(0,200))}</div>
        <span class="badge">${type}</span>${tags}
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);padding:12px">❌ ${esc(e.message)}</div>`;
  }
}

// ==================== GRAPH ==================== //
async function graph() {
  app.innerHTML = `
    <div class="topbar"><h1>🔗 知识图谱</h1><div class="sub">Wiki 实体关系可视化</div></div>
    <div class="card"><div class="card-title">🌐 实体关系图</div>
      <div class="graph-container" id="graphContainer">
        <div class="graph-placeholder" id="graphPlaceholder"><div class="spinner"></div></div>
      </div>
    </div>
    <div class="card"><div class="card-title">📊 实体列表</div><div id="entityList"><div class="spinner"></div></div></div>`;
  try {
    const [graphData, listData] = await Promise.all([
      get('/api/graph'),
      get('/api/status')
    ]);
    const gl = $('#graphPlaceholder');
    if(gl) {
      const nodes = graphData.nodes || [];
      const edges = graphData.edges || [];
      gl.innerHTML = `<div style="padding:12px;text-align:center">
        <div style="font-size:32px;margin-bottom:6px">🔗</div>
        <div style="font-size:14px;color:var(--fg2)">${nodes.length} 个实体, ${edges.length} 条关系</div>
        <div style="font-size:12px;color:var(--fg3);margin-top:4px">${nodes.slice(0,20).map(n => `<span class="tag">${esc(n.name||n.id)}</span>`).join('')}</div>
      </div>`;
    }
    const el = $('#entityList');
    if(el && listData.entities) {
      el.innerHTML = listData.entities.map(e => `
        <div class="file-list-item">
          <span><strong>${esc(e.name||e.id)}</strong> <span class="tag">${esc(e.type||'entity')}</span></span>
          ${e.article_path ? `<button class="btn btn-sm btn-outline" onclick="viewArticle('${esc(e.article_path)}')">查看</button>` : ''}
        </div>
      `).join('');
    } else if(el) {
      el.innerHTML = '<div class="empty"><span class="ico">📊</span><p>暂无实体数据</p></div>';
    }
  } catch(e) {
    const gl = $('#graphPlaceholder');
    if(gl) gl.innerHTML = `<div style="color:var(--red);padding:12px">❌ ${esc(e.message)}</div>`;
  }
}

// ==================== UPLOAD ==================== //
function upload() {
  app.innerHTML = `
    <div class="topbar"><h1>📤 上传源文件</h1><div class="sub">上传文本文件作为 Wiki 知识源</div></div>
    <div class="card">
      <div class="card-title">📎 选择文件</div>
      <div class="upload-zone" id="dropZone">
        <span class="ico">📄</span>
        <div class="hint">点击选择文件 或 拖拽文件到此处</div>
        <div style="font-size:11px;color:var(--fg3);margin-top:6px">支持 .txt .md 等文本格式，最大 50MB</div>
      </div>
      <input type="file" id="fileInput" accept=".txt,.md,.json,.yaml,.yml,.csv,.html,.css,.js,.py,.go,.ts,.jsx,.tsx" style="display:none">
      <div class="upload-progress" id="progress" style="display:none">
        <div class="bar-wrap"><div class="bar" id="progressBar"></div></div>
        <div class="label" id="progressLabel">上传中...</div>
      </div>
    </div>
    <div class="card"><div class="card-title">📄 已上传源文件</div><div id="uploadedFiles"><div class="spinner"></div></div></div>`;
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');
  if(dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if(e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if(fileInput.files.length) uploadFile(fileInput.files[0]); });
  }
  loadUploadedFiles();
}

async function uploadFile(file) {
  if(file.size > 50*1024*1024) { msg('文件超过50MB限制'); return; }
  const progress = $('#progress');
  const bar = $('#progressBar');
  const label = $('#progressLabel');
  if(progress) progress.style.display = 'block';
  if(bar) bar.style.width = '30%';
  if(label) label.textContent = `正在上传 ${file.name}...`;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/sources/upload', { method:'POST', body:fd });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || data.message || r.statusText);
    if(bar) bar.style.width = '100%';
    if(label) label.textContent = `✅ ${data.filename} 上传成功 (${size(data.size)})`;
    msg(data.message || '上传成功');
    setTimeout(() => { if(progress) progress.style.display = 'none'; }, 2000);
    loadUploadedFiles();
  } catch(e) {
    if(bar) bar.style.width = '0%';
    if(label) label.textContent = `❌ 上传失败: ${e.message}`;
    msg('上传失败: '+e.message);
  }
}

async function loadUploadedFiles() {
  const el = $('#uploadedFiles');
  if(!el) return;
  try {
    const data = await get('/api/sources');
    const sources = data.sources || [];
    if(!sources.length) {
      el.innerHTML = '<div class="empty"><span class="ico">📂</span><p>暂无源文件</p></div>';
      return;
    }
    el.innerHTML = sources.map(s => `
      <div class="file-list-item">
        <span>${esc(s.name)} <span style="color:var(--fg3);font-size:12px">${size(s.size)}</span></span>
        <span style="color:var(--fg3);font-size:12px">${date(s.mod_time)}</span>
      </div>
    `).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);padding:12px">❌ ${esc(e.message)}</div>`;
  }
}

// ==================== SETTINGS ==================== //
async function settings() {
  app.innerHTML = `
    <div class="topbar"><h1>⚙️ 设置</h1><div class="sub">Wiki 配置管理</div></div>
    <div class="card"><div id="settingsForm"><div class="spinner"></div></div></div>
    <div class="card">
      <div class="card-title">ℹ️ 服务信息</div>
      <div id="serverInfo"><div class="spinner"></div></div>
    </div>`;
  try {
    const [cfg, health] = await Promise.all([get('/api/config'), get('/api/health')]);
    const sf = $('#settingsForm');
    if(sf) sf.innerHTML = `
      <div class="card-title">🔧 基本设置</div>
      <div class="form-group"><label>项目名称</label><input id="cfgProject" value="${esc(cfg.Project||'sage-wiki')}"></div>
      <div class="form-group"><label>输出目录</label><input id="cfgOutput" value="${esc(cfg.Output||'wiki')}"></div>
      <div class="form-group"><label>LLM 模型</label><input id="cfgLlm" value="${esc(cfg.Models?.Summarize||cfg.Model||'')}"></div>
      <div class="form-group"><label>Embedding 模型</label><input id="cfgEmbed" value="${esc(cfg.Embed?.Model||'')}"></div>
      <div class="form-group"><label>语言</label>
        <select id="cfgLang">
          <option value="Chinese" ${cfg.Language==='Chinese'?'selected':''}>中文</option>
          <option value="English" ${cfg.Language==='English'?'selected':''}>English</option>
        </select>
      </div>
      <div class="btn-group">
        <button class="btn" onclick="saveConfig()">💾 保存设置</button>
        <button class="btn btn-outline" onclick="dashboard()">← 返回仪表盘</button>
      </div>`;
    const si = $('#serverInfo');
    if(si) si.innerHTML = `
      <div style="font-size:13px;line-height:1.8">
        <div><strong>版本</strong> <span style="color:var(--fg2)">${esc(health.version||'sage-wiki-plus')}</span></div>
        <div><strong>项目</strong> <span style="color:var(--fg2)">${esc(health.project||'-')}</span></div>
        <div><strong>语言</strong> <span style="color:var(--fg2)">${esc(health.language||'Chinese')}</span></div>
        <div><strong>状态</strong> <span style="color:${health.status==='healthy'?'var(--green)':'var(--red)'}">${esc(health.status||'unknown')}</span></div>
      </div>`;
  } catch(e) {
    const sf = $('#settingsForm');
    if(sf) sf.innerHTML = `<div style="color:var(--red)">❌ 加载失败: ${esc(e.message)}</div>`;
  }
}

async function saveConfig() {
  const data = {};
  const p = $('#cfgProject'); if(p) data.project = p.value;
  const o = $('#cfgOutput'); if(o) data.output = o.value;
  const l = $('#cfgLlm'); if(l) data.llm_model = l.value;
  const e = $('#cfgEmbed'); if(e) data.embedding_model = e.value;
  const lang = $('#cfgLang'); if(lang) data.language = lang.value;
  try {
    const r = await post('/api/config', data);
    msg('设置已保存');
  } catch(e) { msg('保存失败: '+e.message); }
}

// ==================== COMPILE STATUS POLL ==================== //
// (optional - manual compile via dashboard)

// ==================== INIT ==================== //
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
  // Initial render
  render();
});
