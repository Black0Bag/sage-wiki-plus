package web

import (
	"encoding/json"
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
		// Merge updates into config
		cfgPath := filepath.Join(s.projectDir, "config.yaml")
		newCfg, err := config.Load(cfgPath)
		if err != nil {
			http.Error(w, "config load error", http.StatusInternalServerError)
			return
		}
		// Apply simple field overrides (expand as needed)
		if v, ok := updates["llm_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.LLM.Model = s
			}
		}
		if v, ok := updates["embedding_model"]; ok {
			if s, ok := v.(string); ok {
				newCfg.Embedding.Model = s
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
		// Save
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

	// Limit to 50MB
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

	// Path traversal check
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

	// Auto-compile hint
	writeJSON(w, map[string]any{
		"status":   "ok",
		"filename": header.Filename,
		"size":     written,
		"path":     destPath,
		"message":  "File saved. Run /api/compile to compile.",
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

	// Sort by name
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

	// Run compile in background
	go func() {
		cmd := exec.Command("sage-wiki", "compile", "--dir", s.projectDir)
		cmd.Dir = s.projectDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			log.Error("compile failed", "error", err, "output", string(out))
			return
		}
		log.Info("compile completed", "output", string(out))
		// Notify WebSocket clients
		s.BroadcastReload()
	}()

	writeJSON(w, map[string]any{"status": "started", "message": "Compilation started in background"})
}

// ---------- 模型发现 ----------

func (s *WebServer) handleModels(w http.ResponseWriter, r *http.Request) {
	// Return configured models + try to auto-discover from common providers
	models := map[string]any{
		"configured": map[string]string{
			"llm":       s.cfg.LLM.Model,
			"embedding": s.cfg.Embedding.Model,
		},
		"providers": []map[string]any{},
	}

	// Try OpenAI-compatible endpoint for model list
	if s.cfg.LLM.APIBase != "" {
		models["llm_api_base"] = s.cfg.LLM.APIBase
	}
	if s.cfg.Embedding.APIBase != "" {
		models["embedding_api_base"] = s.cfg.Embedding.APIBase
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

		// Ensure .md extension
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
	// Simple health check: ping DB
	_, err := s.db.ReadDB().Exec("SELECT 1")
	healthy := err == nil
	writeJSON(w, map[string]any{
		"status":    map[bool]string{true: "healthy", false: "unhealthy"}[healthy],
		"project":   s.cfg.Project,
		"version":   "sage-wiki-plus",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}


