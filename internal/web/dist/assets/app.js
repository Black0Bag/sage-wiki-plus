/* === Sage Wiki Plus — Cyber Sage UI === */

// ===================== API Client =====================
const API = {
  async fetch(url, opts = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', ...opts.headers },
        ...opts,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) return res.json();
      return res;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error(`请求失败: ${e.message}`);
    }
  },
  async tree() { return this.fetch('/api/tree'); },
  async status() { return this.fetch('/api/status'); },
  async article(path) { return this.fetch('/api/articles/' + encodeURI(path)); },
  async search(q, limit = 20) { return this.fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`); },
  async graph() { return this.fetch('/api/graph'); },
  async config() { return this.fetch('/api/config'); },
  async saveConfig(cfg) { return this.fetch('/api/config', { method: 'PUT', body: JSON.stringify(cfg), headers: { 'Content-Type': 'application/json' } }); },
  async sources() { return this.fetch('/api/sources'); },
  async compile() { return this.fetch('/api/compile', { method: 'POST' }); },
  async manifest() { return this.fetch('/api/manifest'); },
  async health() { return this.fetch('/api/health'); },
  async models() { return this.fetch('/api/models').catch(() => []); },
  async provenance(path) { return this.fetch(`/api/provenance?path=${encodeURIComponent(path)}`).catch(() => null); },
  async uploadSource(file) {
    const form = new FormData();
    form.append('file', file);
    return this.fetch('/api/sources/upload', { method: 'POST', body: form });
  },
};

// ===================== Markdown Renderer =====================
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^(\d+)\. (.+)$/gm, '<li value="$1">$2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, label) => {
      const path = p.trim().replace(/\s+/g, '-').toLowerCase();
      return `<a class="wikilink" onclick="navigate('/article/${encodeURIComponent(path)}')">${label || p.trim()}</a>`;
    })
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<pre${lang ? ` data-lang="${lang}"` : ''}><code>${escaped}</code></pre>`;
    });
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/((?:<blockquote>.*?<\/blockquote>\n?)+)/g, '<blockquote>$1</blockquote>').replace(/<\/blockquote>\n?<blockquote>/g, '\n');
  html = html.replace(/^\|(.+)\|$/gm, (m) => {
    const cells = m.slice(1,-1).split('|').map(c => c.trim());
    if (cells.every(c => /^[-:\s]+$/.test(c))) return '<tr class="sep">';
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  });
  html = html.replace(/((?:<tr>.*?<\/tr>\n?)+)/g, '<table>$1</table>');
  html = html.replace(/<tr class="sep">[\s\S]*?<\/tr>/g, '');
  return html;
}

// ===================== Toast =====================
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
}

// ===================== Router =====================
function navigate(path) {
  history.pushState(null, '', '#' + path);
  route();
}
window.addEventListener('popstate', route);

// ===================== App Shell =====================
function renderShell(content, title) {
  return `
    <nav id="mobile-nav">
      <button class="nav-item${title === 'home' ? ' active' : ''}" onclick="navigate('/')"><span class="nav-icon">🏠</span>首页</button>
      <button class="nav-item${title === 'browse' ? ' active' : ''}" onclick="navigate('/browse')"><span class="nav-icon">📂</span>浏览</button>
      <button class="nav-item${title === 'search' ? ' active' : ''}" onclick="navigate('/search')"><span class="nav-icon">🔍</span>搜索</button>
      <button class="nav-item${title === 'graph' ? ' active' : ''}" onclick="navigate('/graph')"><span class="nav-icon">🕸</span>图谱</button>
      <button class="nav-item${title === 'more' ? ' active' : ''}" onclick="navigate('/sources')"><span class="nav-icon">⚙</span>管理</button>
    </nav>
    <div id="main">${content}</div>
    <div id="sidebar-overlay" onclick="closeSidebar()"></div>
    <div id="sidebar">
      <div id="sidebar-search"><input placeholder="搜索文章…" onkeydown="if(event.key==='Enter'&&this.value.trim())navigate('/search?q='+encodeURIComponent(this.value.trim()))"></div>
      <div id="sidebar-content"></div>
    </div>
  `;
}

function skeleton(type) {
  if (type === 'card') return '<div class="skel-card"></div>';
  if (type === 'lines') return '<div class="skeleton skel-line"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line"></div>';
  if (type === 'ring') return '<div style="text-align:center;padding:20px"><div class="skeleton skel-ring"></div></div>';
  return '<div class="loading"><div class="spinner"></div><span style="color:var(--fg3)">加载中…</span></div>';
}

// ===================== Ring Chart SVG =====================
function ringChart(value, total, color, label) {
  const r = 30, circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const offset = circ * (1 - pct);
  return `
    <div class="glass stat-ring">
      <svg viewBox="0 0 72 72">
        <circle class="ring-bg" cx="36" cy="36" r="${r}"/>
        <circle class="ring-fg" cx="36" cy="36" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" style="stroke:${color}"/>
      </svg>
      <div class="ring-value" style="color:${color}">${value}</div>
      <div class="ring-label">${label}</div>
    </div>
  `;
}

// ===================== Pages =====================

// --- Dashboard ---
async function renderDashboard() {
  document.getElementById('app').innerHTML = renderShell(skeleton('card') + skeleton('card'), 'home');
  try {
    const [status, health, tree] = await Promise.all([
      API.status().catch(() => ({entities:0, relations:0, entries:0, dimensions:0})),
      API.health().catch(() => ({})),
      API.tree().catch(() => ({concepts:[], summaries:[], outputs:[], stats:{concepts:0, summaries:0}})),
    ]);
    const stats = tree.stats || {};
    const concepts = stats.concepts || 0;
    const summaries = stats.summaries || 0;
    const entities = status.entities || 0;
    const relations = status.relations || 0;
    const total = Math.max(concepts + summaries, 1);

    const recentItems = [...(tree.concepts || []), ...(tree.summaries || [])].slice(0, 5);

    document.getElementById('app').innerHTML = renderShell(`
      <div class="page-header">
        <h1>${health.project || 'Sage Wiki'}</h1>
        <p>${health.status === 'healthy' ? '系统运行正常' : '系统异常'} · ${health.version || ''}</p>
        <div class="header-line"></div>
      </div>

      <div class="stats-grid">
        ${ringChart(concepts, total, '#6c8dff', '概念文章')}
        ${ringChart(summaries, total, '#a78bfa', '摘要文章')}
        ${ringChart(entities, Math.max(entities,1), '#22d3ee', '知识实体')}
        ${ringChart(relations, Math.max(relations,1), '#34d399', '实体关系')}
      </div>

      <div class="quick-actions">
        <button class="quick-btn" onclick="navigate('/browse')">
          <div class="qb-icon" style="background:rgba(108,141,255,0.12);color:var(--accent)">📂</div>
          <div><div class="qb-text">浏览文章</div><div class="qb-sub">${concepts + summaries} 篇文章</div></div>
        </button>
        <button class="quick-btn" onclick="navigate('/search')">
          <div class="qb-icon" style="background:rgba(167,139,250,0.12);color:var(--purple)">🔍</div>
          <div><div class="qb-text">搜索知识库</div><div class="qb-sub">全文搜索</div></div>
        </button>
        <button class="quick-btn" onclick="navigate('/graph')">
          <div class="qb-icon" style="background:rgba(34,211,238,0.12);color:var(--cyan)">🕸</div>
          <div><div class="qb-text">知识图谱</div><div class="qb-sub">${entities} 实体 · ${relations} 关系</div></div>
        </button>
        <button class="quick-btn" onclick="navigate('/compile')">
          <div class="qb-icon" style="background:rgba(52,211,153,0.12);color:var(--green)">⚡</div>
          <div><div class="qb-text">触发编译</div><div class="qb-sub">更新知识库</div></div>
        </button>
      </div>

      ${recentItems.length ? `
      <div class="recent-section">
        <div class="section-title">最近文章</div>
        ${recentItems.map(item => `
          <div class="recent-item" onclick="navigate('/article/${encodeURIComponent(item.path)}')">
            <div class="ri-dot" style="background:${item.path.includes('concept') ? 'var(--accent)' : 'var(--purple)'}"></div>
            <div class="ri-title">${item.name}</div>
            <div class="ri-meta">${item.path.split('/')[0]}</div>
          </div>
        `).join('')}
      </div>` : '<div class="empty-state">暂无文章，请先添加源文件并编译</div>'}
    `, 'home');
  } catch (e) {
    document.getElementById('app').innerHTML = renderShell(`<div class="error-state">❌ 加载失败: ${e.message}</div>`);
  }
}

// --- Browse ---
async function renderBrowse() {
  document.getElementById('app').innerHTML = renderShell(skeleton('lines'), 'browse');
  try {
    const data = await API.tree();
    const concepts = data.concepts || [];
    const summaries = data.summaries || [];
    document.getElementById('app').innerHTML = renderShell(`
      <div class="page-header"><h1>浏览文章</h1><p>浏览知识库中的全部文章</p><div class="header-line"></div></div>
      <div class="tree-group">
        <div class="tree-group-title">📝 概念文章 <span class="tgt-count">${concepts.length}</span></div>
        ${concepts.length ? concepts.map(c => `
          <button class="tree-item" onclick="navigate('/article/${encodeURIComponent(c.path)}')">
            <span class="ti-icon">📄</span> ${c.name}
          </button>
        `).join('') : '<div class="empty-state">暂无概念文章</div>'}
      </div>
      <div class="tree-group">
        <div class="tree-group-title">📋 摘要文章 <span class="tgt-count">${summaries.length}</span></div>
        ${summaries.length ? summaries.map(s => `
          <button class="tree-item" onclick="navigate('/article/${encodeURIComponent(s.path)}')">
            <span class="ti-icon">📋</span> ${s.name}
          </button>
        `).join('') : '<div class="empty-state">暂无摘要文章</div>'}
      </div>
    `, 'browse');
  } catch (e) {
    document.getElementById('app').innerHTML = renderShell(`<div class="error-state">❌ ${e.message}</div>`);
  }
}

// --- Article ---
async function renderArticle(articlePath) {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="top-bar"><button class="back-btn" onclick="history.back()">←</button></div>
    ${skeleton('lines')}${skeleton('lines')}
  `, 'browse');
  try {
    const article = await API.article(articlePath);
    const body = article.body || '';
    const fm = article.frontmatter || {};
    const title = fm.title || decodeURIComponent(articlePath.split('/').pop() || '').replace(/\.md$/i,'') || '无标题';

    const headers = body.match(/^#{2,3}\s.+$/gm) || [];
    const toc = headers.map(h => {
      const level = h.startsWith('### ') ? 'h3' : 'h2';
      const text = h.replace(/^#+\s/, '');
      return `<a class="toc-${level}" href="#${text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-')}">${text}</a>`;
    }).join('');

    let processedBody = body;
    processedBody = processedBody.replace(/\s\{#[^}]+\}/g, '');

    document.getElementById('app').innerHTML = renderShell(`
      <div class="top-bar"><button class="back-btn" onclick="history.back()">←</button><span style="color:var(--fg3);font-size:0.82rem">${articlePath}</span></div>
      <div class="article-title">${title}</div>
      <div class="article-meta">
        ${fm.tags ? `<span>标签: ${fm.tags.split(',').map(t => `<span class="am-tag">${t.trim()}</span>`).join(' ')}</span>` : ''}
        ${fm.author ? `<span>作者: ${fm.author}</span>` : ''}
        ${fm.date ? `<span>${fm.date}</span>` : ''}
      </div>
      ${toc ? `<div class="toc"><div class="toc-title">📑 目录</div>${toc}</div>` : ''}
      <div class="article-body">${renderMarkdown(processedBody)}</div>
    `, 'browse');
  } catch (e) {
    document.getElementById('app').innerHTML = renderShell(`
      <div class="top-bar"><button class="back-btn" onclick="history.back()">←</button></div>
      <div class="error-state">❌ 加载失败: ${e.message}</div>
    `);
  }
}

// --- Search ---
async function renderSearch(q) {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="page-header"><h1>搜索</h1><p>全文搜索知识库内容</p><div class="header-line"></div></div>
    <div class="search-box">
      <input id="search-input" placeholder="输入关键词…" value="${q || ''}" onkeydown="if(event.key==='Enter'&&this.value.trim()){window._doSearch(this.value.trim())}" autofocus>
      <button class="btn btn-primary" onclick="var i=document.getElementById('search-input');if(i.value.trim())window._doSearch(i.value.trim())">搜索</button>
    </div>
    <div id="search-results"></div>
  `, 'search');

  window._doSearch = async (query) => {
    navigate('/search?q=' + encodeURIComponent(query));
    const el = document.getElementById('search-results');
    if (!el) return;
    el.innerHTML = '<div class="loading"><div class="spinner"></div>搜索中…</div>';
    try {
      const data = await API.search(query);
      const hits = data.results || data.hits || [];
      if (!hits || !hits.length) {
        el.innerHTML = '<div class="empty-state">未找到匹配结果</div>';
        return;
      }
      el.innerHTML = hits.map(h => {
        const path = h.path || '';
        const escapedPath = encodeURIComponent(path);
        return `<div class="search-hit"${path ? ` onclick="navigate('/article/${escapedPath}')"` : ''}>
          <div class="hit-title">${h.title || h.id || path}</div>
          <div class="hit-snippet">${h.snippet || h.excerpt || ''}</div>
          ${path ? `<div class="hit-path">${path}</div>` : ''}
        </div>`;
      }).join('');
    } catch(e) {
      el.innerHTML = `<div class="error-state">❌ ${e.message}</div>`;
    }
  };

  if (q) window._doSearch(q);
}

// --- Graph ---
async function renderGraph() {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="page-header"><h1>知识图谱</h1><p>知识实体关系可视化</p><div class="header-line"></div></div>
    <div class="graph-controls" id="graph-controls"></div>
    <div id="graph-container"><div class="loading"><div class="spinner"></div>加载图谱…</div></div>
  `, 'graph');

  try {
    const data = await API.graph();
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    if (!nodes.length) {
      document.getElementById('graph-container').innerHTML = '<div class="empty-state">暂无图谱数据，请先编译知识库</div>';
      return;
    }

    const positions = {};
    const center = { x: 0, y: 0 };
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const radius = 80 + Math.random() * 40;
      positions[n.id] = { x: Math.cos(angle) * radius + Math.random() * 20, y: Math.sin(angle) * radius + Math.random() * 20 };
    });

    const adj = {};
    edges.forEach(e => {
      (adj[e.source] = adj[e.source] || []).push(e.target);
      (adj[e.target] = adj[e.target] || []).push(e.source);
    });
    const deg = {};
    Object.keys(adj).forEach(id => { deg[id] = adj[id].length; });

    for (let iter = 0; iter < 50; iter++) {
      nodes.forEach(n => {
        const p = positions[n.id];
        if (!p) return;
        nodes.forEach(other => {
          if (other.id === n.id) return;
          const op = positions[other.id];
          if (!op) return;
          const dx = p.x - op.x, dy = p.y - op.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const force = 500 / (dist * dist);
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        });
        (adj[n.id] || []).forEach(target => {
          const tp = positions[target];
          if (!tp) return;
          const dx = tp.x - p.x, dy = tp.y - p.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          p.x += (dx / dist) * 0.05;
          p.y += (dy / dist) * 0.05;
        });
        p.x += (center.x - p.x) * 0.005;
        p.y += (center.y - p.y) * 0.005;
      });
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => { const p = positions[n.id]; if (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); } });
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

    const typeColors = { concept: '#6c8dff', technique: '#a78bfa', source: '#4a5070', artifact: '#fbbf24', person: '#f472b6', entity: '#22d3ee', default: '#6c8dff' };

    const types = [...new Set(nodes.map(n => n.type || 'default'))];
    const controlsEl = document.getElementById('graph-controls');
    if (controlsEl) {
      controlsEl.innerHTML = types.map(t => `<button class="gc-btn active" data-type="${t}" onclick="toggleGraphType(this)">${t}</button>`).join('');
    }
    window.toggleGraphType = (btn) => {
      btn.classList.toggle('active');
      renderGraphNodes();
    };

    function renderGraphNodes() {
      const activeTypes = [...document.querySelectorAll('.gc-btn.active')].map(b => b.dataset.type);
      const filtered = nodes.filter(n => activeTypes.includes(n.type || 'default'));
      const fIds = new Set(filtered.map(n => n.id));
      const fEdges = edges.filter(e => fIds.has(e.source) && fIds.has(e.target));

      let svg = `<svg width="100%" height="100%" viewBox="-200 -200 400 400" style="background:transparent">`;
      fEdges.forEach(e => {
        const sp = positions[e.source], tp = positions[e.target];
        if (!sp || !tp) return;
        const sx = (sp.x - minX) / rangeX * 360 - 180, sy = (sp.y - minY) / rangeY * 360 - 180;
        const tx = (tp.x - minX) / rangeX * 360 - 180, ty = (tp.y - minY) / rangeY * 360 - 180;
        svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="rgba(108,141,255,0.12)" stroke-width="1"/>`;
      });
      filtered.forEach(n => {
        const p = positions[n.id]; if (!p) return;
        const cx = (p.x - minX) / rangeX * 360 - 180, cy = (p.y - minY) / rangeY * 360 - 180;
        const d = deg[n.id] || 0;
        const size = Math.max(5, Math.min(14, 5 + d * 2));
        const color = typeColors[n.type] || typeColors.default;
        const label = (n.name || n.label || n.id);
        const shortLabel = label.length > 10 ? label.slice(0, 10) + '…' : label;
        svg += `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${color}" opacity="0.85" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" style="cursor:pointer" onmouseover="this.setAttribute('r',${size+3})" onmouseout="this.setAttribute('r',${size})" onclick="navigate('/article/${encodeURIComponent(n.path || n.id)}')"/>`;
        if (size > 6) {
          svg += `<text x="${cx}" y="${cy + size + 10}" text-anchor="middle" class="node-label">${shortLabel}</text>`;
        }
      });
      svg += '</svg>';
      const container = document.getElementById('graph-container');
      if (container) container.innerHTML = svg;
    }

    renderGraphNodes();
  } catch (e) {
    const container = document.getElementById('graph-container');
    if (container) container.innerHTML = `<div class="error-state">❌ ${e.message}</div>`;
  }
}

// --- Sources ---
async function renderSources() {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="page-header"><h1>源文件管理</h1><p>上传和管理知识库源文件</p><div class="header-line"></div></div>
    <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
      <div class="upload-icon">📤</div>
      <div><strong>点击上传文件</strong></div>
      <div style="font-size:0.82rem;margin-top:4px">支持 .md .txt .pdf 等格式</div>
      <input type="file" id="file-input" style="display:none" onchange="uploadFile(this.files[0])">
    </div>
    <div id="sources-list"><div class="loading"><div class="spinner"></div>加载源文件…</div></div>
  `, 'more');

  window.uploadFile = async (file) => {
    if (!file) return;
    toast('上传中…');
    try {
      await API.uploadSource(file);
      toast('✅ 上传成功');
      renderSources();
    } catch (e) {
      toast('❌ ' + e.message);
    }
  };

  try {
    const data = await API.sources();
    const srcList = data.sources || data.files || data || [];
    const listEl = document.getElementById('sources-list');
    if (!listEl) return;
    if (!srcList.length) {
      listEl.innerHTML = '<div class="empty-state">暂无源文件，点击上方区域上传</div>';
      return;
    }
    listEl.innerHTML = (Array.isArray(srcList) ? srcList : []).map(s => `
      <div class="source-item">
        <div>
          <div class="source-name">${s.name || (s.path ? s.path.split('/').pop() : '未知')}</div>
          <div class="source-path">${s.path || ''}</div>
        </div>
        <div style="text-align:right">
          ${s.size ? `<div class="source-size">${(s.size/1024).toFixed(1)} KB</div>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    const listEl = document.getElementById('sources-list');
    if (listEl) listEl.innerHTML = `<div class="error-state">❌ ${e.message}</div>`;
  }
}

// --- Settings ---
async function renderSettings() {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="page-header"><h1>设置</h1><p>知识库配置管理</p><div class="header-line"></div></div>
    <div class="config-editor">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="saveConfig()">💾 保存</button>
        <button class="btn btn-sm" onclick="renderSettings()">↻ 重置</button>
      </div>
      <textarea id="config-editor">${skeleton('lines')}</textarea>
    </div>
  `, 'more');

  try {
    const cfg = await API.config();
    const editor = document.getElementById('config-editor');
    if (editor) editor.value = JSON.stringify(cfg, null, 2);
  } catch (e) {
    const editor = document.getElementById('config-editor');
    if (editor) editor.value = '// 加载配置失败: ' + e.message;
  }

  window.saveConfig = async () => {
    const editor = document.getElementById('config-editor');
    if (!editor) return;
    try {
      const cfg = JSON.parse(editor.value);
      await API.saveConfig(cfg);
      toast('✅ 配置已保存');
    } catch (e) {
      toast('❌ ' + e.message);
    }
  };
}

// --- Compile ---
async function renderCompile() {
  document.getElementById('app').innerHTML = renderShell(`
    <div class="page-header"><h1>编译</h1><p>触发知识库编译并查看状态</p><div class="header-line"></div></div>
    <div class="glass" style="padding:20px;text-align:center;margin-bottom:16px">
      <div style="font-size:2rem;margin-bottom:8px">⚡</div>
      <button class="btn btn-primary" onclick="triggerCompile()" id="compile-btn">🚀 触发编译</button>
      <div id="compile-status" style="margin-top:12px"></div>
    </div>
    <div class="glass" style="padding:16px">
      <div style="font-size:0.82rem;font-weight:600;color:var(--fg2);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">📋 编译清单</div>
      <div id="manifest"><div class="loading"><div class="spinner"></div>加载清单…</div></div>
    </div>
  `, 'more');

  window.triggerCompile = async () => {
    const btn = document.getElementById('compile-btn');
    const status = document.getElementById('compile-status');
    if (!btn || !status) return;
    btn.disabled = true;
    btn.textContent = '⏳ 编译中…';
    status.innerHTML = '<div class="progress-bar"><div class="pb-fill" style="width:30%"></div></div><span style="color:var(--fg3);font-size:0.82rem">正在编译…</span>';
    try {
      await API.compile();
      status.innerHTML = `<span style="color:var(--green)">✅ 编译完成</span>`;
      toast('✅ 编译成功');
    } catch (e) {
      status.innerHTML = `<span style="color:var(--red)">❌ ${e.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 触发编译';
    }
  };

  try {
    const manifest = await API.manifest();
    const el = document.getElementById('manifest');
    if (!el) return;
    if (!manifest) {
      el.innerHTML = '<div class="empty-state">暂无编译记录</div>';
      return;
    }
    const items = manifest.articles || manifest.items || manifest.entries || [];
    if (!items.length) {
      el.innerHTML = '<div class="empty-state">暂无文章</div>';
      return;
    }
    el.innerHTML = items.map(item => `
      <div class="source-item">
        <div>
          <div class="source-name">${item.title || item.path || item.id}</div>
          <div class="source-path">${item.path || ''}</div>
        </div>
        <div><span class="badge" style="background:rgba(52,211,153,0.15);color:var(--green)">已编译</span></div>
      </div>
    `).join('');
  } catch (e) {
    const el = document.getElementById('manifest');
    if (el) el.innerHTML = `<div class="error-state">❌ ${e.message}</div>`;
  }
}

// ===================== Route Handler =====================
function route() {
  const hash = window.location.hash.slice(1) || '/';
  const [basePath, ...rest] = hash.split('?');
  const searchParams = new URLSearchParams(rest.join('?'));
  const path = basePath;

  if (path === '/' || path === '') { renderDashboard(); return; }
  if (path === '/browse') { renderBrowse(); return; }
  if (path === '/search') {
    const q = searchParams.get('q') || '';
    renderSearch(q);
    return;
  }
  if (path === '/graph') { renderGraph(); return; }
  if (path === '/sources') { renderSources(); return; }
  if (path === '/settings') { renderSettings(); return; }
  if (path === '/compile') { renderCompile(); return; }
  if (path.startsWith('/article/')) {
    const articlePath = decodeURIComponent(path.slice(9));
    renderArticle(articlePath);
    return;
  }
  const app = document.getElementById('app');
  if (app) app.innerHTML = renderShell('<div class="error-state">❌ 页面未找到</div>');
}

// ===================== Init =====================
document.addEventListener('DOMContentLoaded', route);
