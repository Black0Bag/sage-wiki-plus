package web

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
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
				newCfg.Models.Extract = s
				newCfg.Models.Write = s
			}
		}
		if v, ok := updates["embedding_model"]; ok {
			if s, ok := v.(string); ok {
				if newCfg.Embed == nil {
					newCfg.Embed = &config.EmbedConfig{}
				}
				newCfg.Embed.Model = s
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
