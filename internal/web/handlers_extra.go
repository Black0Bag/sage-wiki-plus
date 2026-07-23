package web

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Black0Bag/sage-wiki-plus/internal/config"
	"github.com/Black0Bag/sage-wiki-plus/internal/log"
)

// ---------- 配置管理 ----------

func (s *WebServer) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, s.cfg)
	case http.MethodPut, http.MethodPost:
		var updates map[string]any
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		cfgPath := filepath.Join(s.projectDir, "config.yaml")
		newCfg, err := config.Load(cfgPath)
		if err != nil {
			http.Error(w, "config load error", http.StatusInternalServerError)
			return
		}
		if v, ok := updates["llm_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Models.Summarize = s
			}
		}
		if v, ok := updates["extract_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Models.Extract = s
			}
		}
		if v, ok := updates["write_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Models.Write = s
			}
		}
		if v, ok := updates["lint_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Models.Lint = s
			}
		}
		if v, ok := updates["query_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Models.Query = s
			}
		}

		// Embedding: model name
		if v, ok := updates["embedding_model"]; ok {
			if s, ok := v.(string); ok {
				if newCfg.Embed == nil {
					newCfg.Embed = &config.EmbedConfig{}
				}
				newCfg.Embed.Model = s
			}
		}
		// Embedding: provider
		if v, ok := updates["embedding_provider"]; ok {
			if s, ok := v.(string); ok {
				if newCfg.Embed == nil {
					newCfg.Embed = &config.EmbedConfig{}
				}
				newCfg.Embed.Provider = s
			}
		}
		// Embedding: dimensions (accepts both number and string)
		if v, ok := updates["embedding_dims"]; ok {
			if newCfg.Embed == nil {
				newCfg.Embed = &config.EmbedConfig{}
			}
			switch dv := v.(type) {
			case float64:
				newCfg.Embed.Dimensions = int(dv)
			case string:
				if n, err := strconv.Atoi(dv); err == nil && n > 0 {
					newCfg.Embed.Dimensions = n
				}
			}
		}
		// Embedding: base_url
		if v, ok := updates["embedding_base_url"]; ok {
			if s, ok := v.(string); ok {
				if newCfg.Embed == nil {
					newCfg.Embed = &config.EmbedConfig{}
				}
				newCfg.Embed.BaseURL = s
			}
		}
		// Embedding: api_key
		if v, ok := updates["embedding_api_key"]; ok {
			if s, ok := v.(string); ok {
				if newCfg.Embed == nil {
					newCfg.Embed = &config.EmbedConfig{}
				}
				newCfg.Embed.APIKey = s
			}
		}
		if v, ok := updates["project"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Project = s
			}
		}
		if v, ok := updates["output"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Output = s
			}
		}
		if v, ok := updates["language"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Language = s
			}
		}
		if v, ok := updates["api_key"]; ok {
			if s, ok := v.(string); ok {
				newCfg.API.APIKey = s
			}
		}
		if v, ok := updates["api_base"]; ok {
			if s, ok := v.(string); ok {
				newCfg.API.BaseURL = s
			}
		}
		if err := newCfg.Save(cfgPath); err != nil {
			http.Error(w, "config save error", http.StatusInternalServerError)
			return
		}
		s.cfg = newCfg
		writeJSON(w, map[string]any{"status": "ok", "project": s.cfg.Project})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ---------- 文件上传 ----------

func (s *WebServer) handleSourceUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	rawDir := filepath.Join(s.projectDir, "raw")
	os.MkdirAll(rawDir, 0755)

	destPath := filepath.Join(rawDir, header.Filename)

	absDest, _ := filepath.Abs(destPath)
	absRaw, _ := filepath.Abs(rawDir)
	if !strings.HasPrefix(absDest, absRaw) {
		http.Error(w, "path traversal", http.StatusForbidden)
		return
	}

	dst, err := os.Create(destPath)
	if err != nil {
		http.Error(w, "create file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	written, err := io.Copy(dst, file)
	if err != nil {
		http.Error(w, "write file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Info("source uploaded", "name", header.Filename, "size", written)

	writeJSON(w, map[string]any{
		"status":   "ok",
		"filename": header.Filename,
		"size":     written,
		"path":     destPath,
		"message":  "文件已保存，可通过 /api/compile 触发编译",
	})
}

// ---------- 源文件列表 ----------

func (s *WebServer) handleSourceList(w http.ResponseWriter, r *http.Request) {
	rawDir := filepath.Join(s.projectDir, "raw")

	switch r.Method {
	case http.MethodGet:
		entries, err := os.ReadDir(rawDir)
		if err != nil {
			writeJSON(w, map[string]any{"sources": []any{}, "total": 0})
			return
		}

		type sourceInfo struct {
			Name    string `json:"name"`
			Size    int64  `json:"size"`
			ModTime string `json:"mod_time"`
		}

		var sources []sourceInfo
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			info, _ := e.Info()
			sources = append(sources, sourceInfo{
				Name:    e.Name(),
				Size:    info.Size(),
				ModTime: info.ModTime().Format(time.RFC3339),
			})
		}

		sort.Slice(sources, func(i, j int) bool {
			return sources[i].Name < sources[j].Name
		})

		writeJSON(w, map[string]any{"sources": sources, "total": len(sources)})

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if name == "" {
			http.Error(w, "name query param required", http.StatusBadRequest)
			return
		}
		absPath := filepath.Join(rawDir, name)
		absRaw, _ := filepath.Abs(rawDir)
		absResolved, _ := filepath.Abs(absPath)
		if !strings.HasPrefix(absResolved, absRaw) {
			http.Error(w, "path traversal", http.StatusForbidden)
			return
		}
		if err := os.Remove(absPath); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "file not found", http.StatusNotFound)
				return
			}
			http.Error(w, "delete error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		log.Info("source deleted", "name", name)
		writeJSON(w, map[string]any{"status": "deleted", "name": name})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ---------- 原始文件下载 ----------
// GET /api/sources/raw/{name} — 以原始字节返回文件内容（支持任意格式）
func (s *WebServer) handleSourceRaw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/sources/raw/")
	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	rawDir := filepath.Join(s.projectDir, "raw")
	absPath := filepath.Join(rawDir, name)
	absRaw, _ := filepath.Abs(rawDir)
	absResolved, _ := filepath.Abs(absPath)
	if !strings.HasPrefix(absResolved, absRaw) {
		http.Error(w, "path traversal", http.StatusForbidden)
		return
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "file not found", http.StatusNotFound)
			return
		}
		http.Error(w, "read error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Detect content type
	contentType := "application/octet-stream"
	if strings.HasSuffix(name, ".txt") {
		contentType = "text/plain; charset=utf-8"
	} else if strings.HasSuffix(name, ".md") {
		contentType = "text/markdown; charset=utf-8"
	} else if strings.HasSuffix(name, ".html") || strings.HasSuffix(name, ".htm") {
		contentType = "text/html; charset=utf-8"
	} else if strings.HasSuffix(name, ".json") {
		contentType = "application/json"
	} else if strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".jpeg") {
		contentType = "image/jpeg"
	} else if strings.HasSuffix(name, ".png") {
		contentType = "image/png"
	} else if strings.HasSuffix(name, ".gif") {
		contentType = "image/gif"
	} else if strings.HasSuffix(name, ".webp") {
		contentType = "image/webp"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+name+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// ---------- 源文件更新 ----------
// PUT /api/sources/update — 更新 raw/ 下的文件内容
// Body: {"name": "xxx.txt", "content": "..."}
func (s *WebServer) handleSourceUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	rawDir := filepath.Join(s.projectDir, "raw")
	absPath := filepath.Join(rawDir, body.Name)
	absRaw, _ := filepath.Abs(rawDir)
	absResolved, _ := filepath.Abs(absPath)
	if !strings.HasPrefix(absResolved, absRaw) {
		http.Error(w, "path traversal", http.StatusForbidden)
		return
	}
	if err := os.WriteFile(absPath, []byte(body.Content), 0644); err != nil {
		http.Error(w, "write error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Info("source updated", "name", body.Name)
	s.BroadcastReload()
	writeJSON(w, map[string]any{"status": "ok", "name": body.Name})
}

// ---------- 触发编译 ----------

func (s *WebServer) handleCompile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	go func() {
		cmd := exec.Command("sage-wiki", "compile", "--dir", s.projectDir)
		cmd.Dir = s.projectDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			log.Error("compile failed", "error", err, "output", string(out))
			return
		}
		log.Info("compile completed", "output", string(out))
		s.BroadcastReload()
	}()

	writeJSON(w, map[string]any{"status": "started", "message": "编译已后台启动"})
}

// ---------- 模型发现 ----------

func (s *WebServer) handleModels(w http.ResponseWriter, r *http.Request) {
	// Fetch models from provider when ?fetch=true
	if r.URL.Query().Get("fetch") == "true" {
		if s.cfg.API.BaseURL == "" || s.cfg.API.APIKey == "" {
			http.Error(w, "API base URL and key not configured", http.StatusBadRequest)
			return
		}
		baseURL := strings.TrimRight(s.cfg.API.BaseURL, "/")
		modelsURL := baseURL + "/models"

		client := &http.Client{Timeout: 30 * time.Second}
		req, err := http.NewRequest(http.MethodGet, modelsURL, nil)
		if err != nil {
			http.Error(w, "create request: "+err.Error(), http.StatusInternalServerError)
			return
		}
		req.Header.Set("Authorization", "Bearer "+s.cfg.API.APIKey)

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "fetch models: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, "read response: "+err.Error(), http.StatusBadGateway)
			return
		}

		var result map[string]any
		if err := json.Unmarshal(body, &result); err != nil {
			http.Error(w, "parse response: "+err.Error(), http.StatusBadGateway)
			return
		}

		writeJSON(w, result)
		return
	}

	// Return configured models (original behavior)
	models := map[string]any{
		"configured": map[string]string{
			"llm":       s.cfg.Models.Summarize,
			"embedding": "",
		},
		"providers": []map[string]any{},
	}

	if s.cfg.API.BaseURL != "" {
		models["llm_api_base"] = s.cfg.API.BaseURL
	}
	if s.cfg.Embed != nil && s.cfg.Embed.BaseURL != "" {
		models["embedding_api_base"] = s.cfg.Embed.BaseURL
	}

	writeJSON(w, models)
}

// ---------- 文章写入/更新/删除 ----------

func (s *WebServer) handleArticleWrite(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost, http.MethodPut:
		var body struct {
			Path    string `json:"path"`
			Content string `json:"content"`
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if body.Path == "" {
			http.Error(w, "path required", http.StatusBadRequest)
			return
		}

		if !strings.HasSuffix(body.Path, ".md") {
			body.Path += ".md"
		}

		absPath := filepath.Join(s.projectDir, s.cfg.Output, body.Path)
		absProject, _ := filepath.Abs(s.projectDir)
		absResolved, _ := filepath.Abs(absPath)

		if !strings.HasPrefix(absResolved, absProject) {
			http.Error(w, "path traversal", http.StatusForbidden)
			return
		}

		os.MkdirAll(filepath.Dir(absPath), 0755)
		if err := os.WriteFile(absPath, []byte(body.Content), 0644); err != nil {
			http.Error(w, "write error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		s.BroadcastReload()
		writeJSON(w, map[string]any{"status": "ok", "path": body.Path})

	case http.MethodDelete:
		delPath := r.URL.Query().Get("path")
		if delPath == "" {
			http.Error(w, "path query param required", http.StatusBadRequest)
			return
		}
		if !strings.HasSuffix(delPath, ".md") {
			delPath += ".md"
		}
		absPath := filepath.Join(s.projectDir, s.cfg.Output, delPath)
		absProject, _ := filepath.Abs(s.projectDir)
		absResolved, _ := filepath.Abs(absPath)
		if !strings.HasPrefix(absResolved, absProject) {
			http.Error(w, "path traversal", http.StatusForbidden)
			return
		}
		if err := os.Remove(absPath); err != nil {
			http.Error(w, "delete error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		s.BroadcastReload()
		writeJSON(w, map[string]any{"status": "deleted", "path": delPath})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ---------- Manifest / 编译状态 ----------

func (s *WebServer) handleManifest(w http.ResponseWriter, r *http.Request) {
	mfPath := filepath.Join(s.projectDir, ".manifest.json")
	data, err := os.ReadFile(mfPath)
	if err != nil {
		http.Error(w, "manifest not found (run compile first)", http.StatusNotFound)
		return
	}
	var result map[string]any
	json.Unmarshal(data, &result)
	writeJSON(w, result)
}

// ---------- 健康检查 ----------

func (s *WebServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	_, err := s.db.ReadDB().Exec("SELECT 1")
	healthy := err == nil
	writeJSON(w, map[string]any{
		"status":    map[bool]string{true: "healthy", false: "unhealthy"}[healthy],
		"project":   s.cfg.Project,
		"version":   "sage-wiki-plus",
		"language":  s.cfg.Language,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

// ---------- 📱 分享 API (Android 分享/Chrome 扩展) ----------

// handleShare 接收外部分享内容并保存到 raw/ 目录。
// 适用于: Android Intent.ACTION_SEND、Chrome Extension 的页面内容捕获。
// POST /api/share
// Content-Type: application/json
// {"title": "...", "text": "...", "url": "...", "source": "android|chrome"}
func (s *WebServer) handleShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Title  string `json:"title"`
		Text   string `json:"text"`
		URL    string `json:"url"`
		Source string `json:"source"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}

	if body.Title == "" && body.Text == "" && body.URL == "" {
		http.Error(w, "至少需要 title、text 或 url", http.StatusBadRequest)
		return
	}

	// 生成文件名: 时间戳 + 标题
	ts := time.Now().Format("20060102_150405")
	safeName := strings.ReplaceAll(body.Title, " ", "_")
	if safeName == "" {
		safeName = "shared"
	}
	if len(safeName) > 50 {
		safeName = safeName[:50]
	}
	filename := fmt.Sprintf("share_%s_%s.md", ts, safeName)

	// 构建 Markdown 内容
	var md strings.Builder
	md.WriteString(fmt.Sprintf("# %s\n\n", body.Title))
	if body.URL != "" {
		md.WriteString(fmt.Sprintf("> 来源: %s\n\n", body.URL))
	}
	md.WriteString(fmt.Sprintf("> 分享自: %s\n\n", map[bool]string{true: body.Source, false: "外部应用"}[body.Source != ""]))
	md.WriteString("---\n\n")
	md.WriteString(body.Text)
	md.WriteString("\n")

	rawDir := filepath.Join(s.projectDir, "raw")
	os.MkdirAll(rawDir, 0755)

	destPath := filepath.Join(rawDir, filename)
	if err := os.WriteFile(destPath, []byte(md.String()), 0644); err != nil {
		http.Error(w, "save error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Info("content shared", "source", body.Source, "title", body.Title, "file", filename)

	writeJSON(w, map[string]any{
		"status":   "ok",
		"filename": filename,
		"path":     destPath,
		"message":  "内容已保存到 raw/，可通过 /api/compile 触发编译",
	})
}

// handleShareBookmarklet 返回一个 bookmarklet 代码片段，
// 用户可拖到浏览器书签栏，点击后捕获当前页面内容分享到 sage-wiki。
// GET /api/share/bookmarklet
func (s *WebServer) handleShareBookmarklet(w http.ResponseWriter, r *http.Request) {
	// 获取本机地址
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	jsCode := fmt.Sprintf(`javascript:(function(){
  var t=document.title||"未命名页面";
  var u=location.href;
  var s=getSelection()?getSelection().toString():"";
  var b=document.body?document.body.innerText.substring(0,5000):"";
  var text=s||b;
  fetch("%s/api/share",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({title:t,text:text,url:u,source:"chrome"})
  }).then(function(r){return r.json()}).then(function(j){
    alert("已分享到 sage-wiki: "+j.filename);
  }).catch(function(e){
    alert("分享失败: "+e);
  });
})();`, baseURL)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html><body>
<h2>📌 sage-wiki-plus Bookmarklet</h2>
<p>将下面的链接拖到浏览器书签栏，浏览任意页面时点击即可分享内容到 sage-wiki：</p>
<p><a href="%s" onclick="return false;">📚 分享到 sage-wiki</a></p>
<p>或者手动复制这段代码创建书签：</p>
<pre style="background:#f5f5f5;padding:10px;word-break:break-all;font-size:12px;">%s</pre>
</body></html>`, jsCode, jsCode)
}

// handleSharePreset 返回 Android Intent 配置说明。
// GET /api/share/preset
func (s *WebServer) handleSharePreset(w http.ResponseWriter, r *http.Request) {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html><body>
<h2>📱 sage-wiki-plus 分享配置</h2>

<h3>Android 分享目标</h3>
<p>使用 HTTP POST 将内容发送到：</p>
<pre>POST %s/api/share
Content-Type: application/json

{"title":"...", "text":"...", "url":"...", "source":"android"}</pre>

<h3>Chrome 扩展建议</h3>
<p>使用上述 bookmarklet，或创建一个简单的 Chrome Extension 调用：</p>
<pre>fetch("%s/api/share", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    title: document.title,
    text: window.getSelection().toString(),
    url: location.href,
    source: "chrome"
  })
})</pre>

<h3>快捷方式 (Android)</h3>
<p>在手机浏览器中保存以下链接到桌面：</p>
<pre>%s/api/share/bookmarklet</pre>
</body></html>`, baseURL, baseURL, baseURL)
}

// ---------- 宿主机系统信息 ----------

func (s *WebServer) handleSysInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	info := map[string]any{}

	// --- Go 运行时内存 ---
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	info["go"] = map[string]any{
		"version":      runtime.Version(),
		"goroutines":   runtime.NumGoroutine(),
		"numCPU":       runtime.NumCPU(),
		"mem_alloc":    m.Alloc,
		"mem_sys":      m.Sys,
		"mem_heap":     m.HeapAlloc,
		"gc_pause_ns":  m.PauseTotalNs,
		"num_gc":       m.NumGC,
	}

	// --- 系统内存 ---
	var sysInfo syscall.Sysinfo_t
	if err := syscall.Sysinfo(&sysInfo); err == nil {
		memTotal := uint64(sysInfo.Totalram) * uint64(sysInfo.Unit)
		memFree := uint64(sysInfo.Freeram) * uint64(sysInfo.Unit)
		memBuffer := uint64(sysInfo.Bufferram) * uint64(sysInfo.Unit)
		memUsed := memTotal - memFree - memBuffer
		if memUsed > memTotal {
			memUsed = memTotal - memFree
		}
		memUsagePercent := 0.0
		if memTotal > 0 {
			memUsagePercent = float64(memUsed) / float64(memTotal) * 100
		}

		info["memory"] = map[string]any{
			"total":         memTotal,
			"used":          memUsed,
			"free":          memFree,
			"buffer":        memBuffer,
			"usage_percent": memUsagePercent,
		}

		// --- 系统运行时间 ---
		info["uptime"] = sysInfo.Uptime

		// --- 系统负载 ---
		load1 := float64(sysInfo.Loads[0]) / 65536.0
		load5 := float64(sysInfo.Loads[1]) / 65536.0
		load15 := float64(sysInfo.Loads[2]) / 65536.0
		info["load"] = map[string]any{
			"load_1":  load1,
			"load_5":  load5,
			"load_15": load15,
		}
	}

	// --- 磁盘使用（项目所在分区）---
	var stat syscall.Statfs_t
	if err := syscall.Statfs(s.projectDir, &stat); err == nil {
		diskTotal := stat.Blocks * uint64(stat.Bsize)
		diskFree := stat.Bfree * uint64(stat.Bsize)
		diskUsed := diskTotal - diskFree
		diskPercent := 0.0
		if diskTotal > 0 {
			diskPercent = float64(diskUsed) / float64(diskTotal) * 100
		}
		info["disk"] = map[string]any{
			"total":         diskTotal,
			"used":          diskUsed,
			"free":          diskFree,
			"usage_percent": diskPercent,
		}
	}

	// --- CPU 温度（ARM 设备 /sys/class/thermal/）---
	temps := []map[string]any{}
	for i := 0; i < 8; i++ {
		path := fmt.Sprintf("/sys/class/thermal/thermal_zone%d/temp", i)
		data, err := os.ReadFile(path)
		if err != nil {
			break
		}
		tempStr := strings.TrimSpace(string(data))
		var tempMilli int
		fmt.Sscanf(tempStr, "%d", &tempMilli)
		if tempMilli > 0 {
			zoneType := ""
			if typeData, err := os.ReadFile(fmt.Sprintf("/sys/class/thermal/thermal_zone%d/type", i)); err == nil {
				zoneType = strings.TrimSpace(string(typeData))
			}
			temps = append(temps, map[string]any{
				"zone":     i,
				"type":     zoneType,
				"temp_c":   float64(tempMilli) / 1000.0,
				"temp_raw": tempMilli,
			})
		}
	}
	if len(temps) > 0 {
		info["temperatures"] = temps
	}

	// --- CPU 信息 ---
	if cpuModel, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		lines := strings.Split(string(cpuModel), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "model name") || strings.HasPrefix(line, "Hardware") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					info["cpu_model"] = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// --- 主机名 ---
	if hostname, err := os.Hostname(); err == nil {
		info["hostname"] = hostname
	}

	// --- 编译版本 ---
	info["version"] = runtime.Version()

	writeJSON(w, info)
}

// ---------- 模型有效性测试 ----------

func (s *WebServer) handleModelTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// 如果未提供参数，使用当前配置
	if body.BaseURL == "" {
		body.BaseURL = s.cfg.API.BaseURL
	}
	if body.APIKey == "" {
		body.APIKey = s.cfg.API.APIKey
	}
	if body.Model == "" {
		body.Model = s.cfg.Models.Summarize
	}

	if body.BaseURL == "" || body.APIKey == "" || body.Model == "" {
		http.Error(w, "base_url, api_key and model are required", http.StatusBadRequest)
		return
	}

	// 构建 OpenAI 兼容的 chat completion 测试请求
	chatURL := strings.TrimRight(body.BaseURL, "/") + "/chat/completions"
	reqBody := map[string]any{
		"model": body.Model,
		"messages": []map[string]string{
			{"role": "user", "content": "Hi"},
		},
		"max_tokens": 5,
	}
	reqBytes, _ := json.Marshal(reqBody)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodPost, chatURL, strings.NewReader(string(reqBytes)))
	if err != nil {
		writeJSON(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+body.APIKey)

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start)

	if err != nil {
		writeJSON(w, map[string]any{
			"success":    false,
			"error":      err.Error(),
			"model":      body.Model,
			"latency_ms": elapsed.Milliseconds(),
		})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusOK {
		writeJSON(w, map[string]any{
			"success":     true,
			"model":       body.Model,
			"latency_ms":  elapsed.Milliseconds(),
			"status_code": resp.StatusCode,
		})
	} else {
		writeJSON(w, map[string]any{
			"success":     false,
			"model":       body.Model,
			"latency_ms":  elapsed.Milliseconds(),
			"status_code": resp.StatusCode,
			"error":       string(respBody),
		})
	}
}
