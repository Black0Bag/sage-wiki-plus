// sage-wiki-plus SPA - Mobile-first Knowledge Base UI
(function() {
  'use strict';

  const BASE = '';
  let config = {};

  // ==== Toast notifications ====
  function toast(msg, duration) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration || 2500);
  }

  // ==== API helpers ====
  async function api(path, opts = {}) {
    try {
      const res = await fetch(BASE + path, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return res.text();
    } catch (e) {
      toast('API 错误: ' + e.message);
      throw e;
    }
  }

  // ==== Navigation / Router ====
  let currentRoute = 'dashboard';

  function navigateTo(hash) {
    const route = hash.replace('#/', '').replace('#', '') || 'dashboard';
    switchRoute(route);
  }

  function switchRoute(route) {
    currentRoute = route;
    // Update page visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + route);
    if (page) page.classList.add('active');

    // Update nav title
    const titles = { dashboard:'📊 仪表盘', articles:'📖 文章', search:'🔍 搜索', graph:'🔗 图谱',
      sources:'📤 源文件', editor:'✏️ 编辑', settings:'⚙️ 设置', about:'ℹ️ 关于' };
    document.getElementById('navTitle').textContent = titles[route] || 'sage-wiki+';

    // Update sidebar active
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    const active = document.querySelector(`.menu-item[data-route="${route}"]`);
    if (active) active.classList.add('active');

    // Close sidebar on mobile
    closeSidebar();

    // Route-specific loaders
    if (route === 'dashboard') loadDashboard();
    else if (route === 'articles') loadArticleTree();
    else if (route === 'sources') loadSourceList();
    else if (route === 'settings') loadConfig();
    else if (route === 'graph') initGraph();
    else if (route === 'about') loadAbout();
  }

  // ==== Sidebar ====
  function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('show'); }
  function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('show'); }

  // ==== Dashboard ====
  async function loadDashboard() {
    try {
      const status = await api('/api/status');
      document.getElementById('statEntries').textContent = status.entries ?? '-';
      document.getElementById('statVectors').textContent = status.vectors ?? '-';
      document.getElementById('statEntities').textContent = status.entities ?? '-';
      document.getElementById('statRelations').textContent = status.relations ?? '-';
      document.getElementById('dashboardProject').innerHTML = `<strong>项目：</strong>${status.project || '未设置'}`;
    } catch (e) { /* toast already shown */ }

    try {
      const tree = await api('/api/tree');
      document.getElementById('statConcepts').textContent = tree.stats?.concepts ?? '-';
    } catch (e) {}

    try {
      const src = await api('/api/sources');
      document.getElementById('statSources').textContent = src.total ?? '-';
    } catch (e) {}
  }

  // ==== Article Tree ====
  async function loadArticleTree() {
    const container = document.getElementById('articleTree');
    try {
      const tree = await api('/api/tree');
      let html = '';
      if (tree.concepts?.length) {
        html += `<div class="tree-section"><h3>📝 概念文章 (${tree.concepts.length})</h3>`;
        tree.concepts.forEach(f => {
          html += `<div class="tree-item" onclick="viewArticle('${f.path}')">📄 ${f.name} <span class="path">${f.path}</span></div>`;
        });
        html += '</div>';
      }
      if (tree.summaries?.length) {
        html += `<div class="tree-section"><h3>📋 摘要 (${tree.summaries.length})</h3>`;
        tree.summaries.forEach(f => {
          html += `<div class="tree-item" onclick="viewArticle('${f.path}')">📄 ${f.name} <span class="path">${f.path}</span></div>`;
        });
        html += '</div>';
      }
      if (!html) html = '<p class="hint">暂无文章，请先上传源文件并编译</p>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<p class="hint">无法加载文章列表</p>';
    }
  }

  // ==== Article Viewer ====
  window.viewArticle = async function(path) {
    const viewer = document.getElementById('articleViewer');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '<p>加载中...</p>';
    try {
      const data = await api('/api/articles/' + path);
      let html = '';
      if (data.frontmatter) {
        html += '<div class="article-meta"><small>';
        for (const [k,v] of Object.entries(data.frontmatter)) {
          html += `<strong>${k}:</strong> ${v} `;
        }
        html += '</small></div>';
      }
      // Simple markdown rendering (basic)
      let body = data.body || '';
      body = body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Headers
      body = body.replace(/^### (.+)$/gm, '<h4>$1</h4>');
      body = body.replace(/^## (.+)$/gm, '<h3>$1</h3>');
      body = body.replace(/^# (.+)$/gm, '<h2>$1</h2>');
      // Bold/italic
      body = body.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      body = body.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Code blocks
      body = body.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
      // Inline code
      body = body.replace(/`(.+?)`/g, '<code>$1</code>');
      // Links
      body = body.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
      // Lists
      body = body.replace(/^- (.+)$/gm, '<li>$1</li>');

      html += '<pre style="white-space:pre-wrap;word-break:break-word">' + body + '</pre>';
      viewer.innerHTML = html;
    } catch (e) {
      viewer.innerHTML = '<p class="hint">无法加载文章</p>';
    }
  };

  // ==== Search ====
  window.doSearch = async function() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    const container = document.getElementById('searchResults');
    container.innerHTML = '<p>搜索中...</p>';
    try {
      const data = await api('/api/search?q=' + encodeURIComponent(q) + '&limit=20');
      if (!data.results?.length) {
        container.innerHTML = '<p class="hint">未找到结果</p>';
        return;
      }
      let html = `<p>找到 ${data.total} 个结果：</p>`;
      data.results.forEach(r => {
        html += `<div class="search-result" onclick="viewArticle('${r.path}')">
          <h4>📄 ${r.path}</h4>
          <div class="snippet">${escapeHtml(r.snippet)}</div>
          <div class="score">得分: ${r.score?.toFixed(3)}</div>
        </div>`;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<p class="hint">搜索失败</p>';
    }
  };

  // ==== Graph ====
  let graphData = null;
  async function initGraph() {
    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    if (!graphData) {
      try {
        graphData = await api('/api/graph');
      } catch (e) { return; }
    }

    if (!graphData.nodes?.length) {
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无图谱数据，请先编译', rect.width/2, rect.height/2);
      return;
    }

    // Simple force-directed layout
    const nodes = graphData.nodes.map((n, i) => ({
      ...n, x: 50 + Math.random() * (rect.width - 100), y: 50 + Math.random() * (rect.height - 100),
      vx: 0, vy: 0, radius: Math.min(30, 8 + (n.connections || 0) * 2)
    }));
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);

    // Edges
    const edges = (graphData.edges || []).filter(e => nodeMap[e.source] && nodeMap[e.target]);

    // Force simulation (simplified)
    const W = rect.width, H = rect.height;
    for (let iter = 0; iter < 100; iter++) {
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.sqrt(dx*dx + dy*dy) || 1;
          let force = 500 / (dist * dist);
          a.vx -= force * dx / dist;
          a.vy -= force * dy / dist;
          b.vx += force * dx / dist;
          b.vy += force * dy / dist;
        }
      }
      // Attraction along edges
      edges.forEach(e => {
        const a = nodeMap[e.source], b = nodeMap[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const force = dist * 0.01;
        a.vx += force * dx / dist;
        a.vy += force * dy / dist;
        b.vx -= force * dx / dist;
        b.vy -= force * dy / dist;
      });
      // Center gravity
      nodes.forEach(n => {
        n.vx += (W/2 - n.x) * 0.001;
        n.vy += (H/2 - n.y) * 0.001;
        n.vx *= 0.9; n.vy *= 0.9;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(20, Math.min(W-20, n.x));
        n.y = Math.max(20, Math.min(H-20, n.y));
      });
    }

    // Draw
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    edges.forEach(e => {
      const a = nodeMap[e.source], b = nodeMap[e.target];
      if (!a || !b) return;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    const typeColors = { concept: '#4f8cff', technique: '#2ecc71', source: '#e74c3c',
      claim: '#f39c12', artifact: '#9b59b6' };
    nodes.forEach(n => {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI*2);
      ctx.fillStyle = typeColors[n.type] || '#666';
      ctx.fill();
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.name?.substring(0, 12) || n.id, n.x, n.y + n.radius + 12);
    });
  }

  // ==== Source Upload ====
  let uploadQueue = [];

  document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    if (!uploadArea) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault(); uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) uploadFiles(fileInput.files);
      fileInput.value = '';
    });
  });

  async function uploadFiles(files) {
    const progress = document.getElementById('uploadProgress');
    progress.classList.remove('hidden');
    progress.innerHTML = '';
    for (const file of files) {
      progress.innerHTML += `<p>📤 上传中: ${file.name} (${(file.size/1024).toFixed(1)}KB)...</p>`;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(BASE + '/api/sources/upload', { method: 'POST', body: formData });
        const data = await res.json();
        progress.innerHTML += `<p>✅ ${data.filename} 上传成功</p>`;
      } catch (e) {
        progress.innerHTML += `<p>❌ ${file.name} 上传失败</p>`;
      }
    }
    progress.innerHTML += '<p>上传完成！<button onclick="loadSourceList()" class="btn">刷新列表</button></p>';
  }

  // ==== Source List ====
  window.loadSourceList = async function() {
    const container = document.getElementById('sourceList');
    try {
      const data = await api('/api/sources');
      if (!data.sources?.length) {
        container.innerHTML = '<p class="hint">暂无源文件</p>';
        return;
      }
      let html = '';
      data.sources.forEach(s => {
        html += `<div class="source-item">
          <div><div class="name">📄 ${escapeHtml(s.name)}</div>
          <div class="meta">${(s.size/1024).toFixed(1)}KB · ${s.mod_time?.substring(0,10) || '-'}</div></div>
        </div>`;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<p class="hint">加载失败</p>';
    }
  };

  // ==== Compile Trigger ====
  window.triggerCompile = async function() {
    try {
      const data = await api('/api/compile', { method: 'POST' });
      toast('编译已启动: ' + (data.message || ''));
    } catch (e) {}
  };

  // ==== Editor ====
  window.loadArticle = async function() {
    const sel = document.getElementById('editorFileSelect');
    const path = sel.value;
    if (!path) return;
    try {
      const data = await api('/api/articles/' + path);
      document.getElementById('editorTextarea').value = data.body || '';
      toast('已加载: ' + path);
    } catch (e) {
      toast('加载失败');
    }
  };

  window.saveArticle = async function() {
    const sel = document.getElementById('editorFileSelect');
    const path = sel.value;
    const content = document.getElementById('editorTextarea').value;
    if (!path) { toast('请先选择或输入文章路径'); return; }
    try {
      const data = await api('/api/article', {
        method: 'POST',
        body: JSON.stringify({ path, content })
      });
      toast('已保存: ' + path);
    } catch (e) {}
  };

  window.deleteArticle = async function() {
    const sel = document.getElementById('editorFileSelect');
    const path = sel.value;
    if (!path) { toast('请选择文章'); return; }
    if (!confirm('确定删除 ' + path + '？')) return;
    try {
      await api('/api/article?path=' + encodeURIComponent(path), { method: 'DELETE' });
      toast('已删除: ' + path);
      sel.value = '';
      document.getElementById('editorTextarea').value = '';
    } catch (e) {}
  };

  async function loadEditorDropdown() {
    const sel = document.getElementById('editorFileSelect');
    try {
      const tree = await api('/api/tree');
      let html = '<option value="">选择文章...</option>';
      ['concepts', 'summaries'].forEach(cat => {
        if (tree[cat]) {
          tree[cat].forEach(f => {
            html += `<option value="${f.path}">${f.path}</option>`;
          });
        }
      });
      sel.innerHTML = html;
    } catch (e) {}
  }

  // ==== Settings ====
  window.loadConfig = async function() {
    try {
      const cfg = await api('/api/config');
      document.getElementById('cfgProject').value = cfg.project || '';
      document.getElementById('cfgLLMModel').value = cfg.llm?.model || cfg.llm_model || '';
      document.getElementById('cfgEmbedModel').value = cfg.embedding?.model || cfg.embedding_model || '';
      document.getElementById('cfgOutput').value = cfg.output || '';
      toast('配置已加载');
    } catch (e) {}
  };

  window.saveConfig = async function() {
    const updates = {
      project: document.getElementById('cfgProject').value,
      llm_model: document.getElementById('cfgLLMModel').value,
      embedding_model: document.getElementById('cfgEmbedModel').value,
      output: document.getElementById('cfgOutput').value
    };
    try {
      await api('/api/config', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      toast('配置已保存');
    } catch (e) {}
  };

  window.discoverModels = async function() {
    const result = document.getElementById('modelDiscoveryResult');
    result.textContent = '扫描中...';
    try {
      const data = await api('/api/models');
      result.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      result.textContent = '扫描失败';
    }
  };

  // ==== About ====
  async function loadAbout() {
    try {
      const health = await api('/api/health');
      document.getElementById('aboutInfo').innerHTML = `
        <p><strong>版本：</strong>${health.version || 'sage-wiki-plus'}</p>
        <p><strong>状态：</strong>${health.status}</p>
        <p><strong>项目：</strong>${health.project || '-'}</p>
        <hr style="border-color:var(--border);margin:12px 0" />
        <p>基于 <a href="https://github.com/xoai/sage-wiki" target="_blank">xoai/sage-wiki</a> 构建</p>
        <p>源代码: <a href="https://github.com/Black0Bag/sage-wiki-plus" target="_blank">Black0Bag/sage-wiki-plus</a></p>
      `;
    } catch (e) {}
  }

  // ==== Connection Health Check ====
  async function checkConnection() {
    try {
      await api('/api/health');
      document.getElementById('connStatus').className = 'status-dot connected';
      document.getElementById('statusText').textContent = '已连接';
    } catch (e) {
      document.getElementById('connStatus').className = 'status-dot disconnected';
      document.getElementById('statusText').textContent = '未连接';
    }
  }

  // ==== Theme ====
  function toggleTheme() {
    // Simple theme toggle placeholder
    toast('主题切换功能可在 config.yaml 中自定义');
  }

  // ==== Helpers ====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==== Init ====
  document.addEventListener('DOMContentLoaded', () => {
    // Router
    window.addEventListener('hashchange', () => navigateTo(location.hash));
    navigateTo(location.hash || '#/');

    // Sidebar events
    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('closeSidebar').addEventListener('click', closeSidebar);

    // Overlay close
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Theme toggle
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);

    // Search on Enter
    document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    // Editor dropdown population when page loads
    const observer = new MutationObserver(() => {
      if (document.getElementById('page-editor')?.classList.contains('active')) {
        loadEditorDropdown();
      }
    });
    document.querySelectorAll('.page').forEach(p => {
      observer.observe(p, { attributes: true, attributeFilter: ['class'] });
    });

    // Connection check
    checkConnection();
    setInterval(checkConnection, 30000);
  });

  // Expose globally
  window.navigateTo = navigateTo;
  window.api = api;
  window.toast = toast;
})();
