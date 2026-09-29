// Command api collects topic ratings ("helpful?" plus what's wrong) from the
// Go Deep site and appends them to a JSONL file. Nothing else: no reads of
// the data over HTTP, so a public endpoint can't leak what others wrote.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

var reasons = map[string]bool{
	"too-complicated": true,
	"too-basic":       true,
	"wrong":           true,
	"confusing-pics":  true,
	"missing":         true,
	"broken":          true,
}

var slugRe = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

// Feedback is one rating as stored.
type Feedback struct {
	Time    time.Time `json:"time"`
	Topic   string    `json:"topic"`
	Vote    string    `json:"vote"`
	Reasons []string  `json:"reasons,omitempty"`
	Section string    `json:"section,omitempty"`
	Note    string    `json:"note,omitempty"`
	Client  string    `json:"client"` // salted hash of the IP, to spot floods; not reversible
}

type input struct {
	Topic   string   `json:"topic"`
	Vote    string   `json:"vote"`
	Reasons []string `json:"reasons"`
	Section string   `json:"section"`
	Note    string   `json:"note"`
}

// clean keeps printable text and newlines, and caps the length in runes.
func clean(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if r == '\n' || unicode.IsPrint(r) {
			return r
		}
		if unicode.IsSpace(r) {
			return ' '
		}
		return -1
	}, strings.ToValidUTF8(s, ""))
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func (in input) validate() (Feedback, string) {
	f := Feedback{Topic: in.Topic, Vote: in.Vote}
	if !slugRe.MatchString(in.Topic) {
		return f, "bad topic"
	}
	if in.Vote != "up" && in.Vote != "down" {
		return f, "vote must be up or down"
	}
	if len(in.Reasons) > len(reasons) {
		return f, "too many reasons"
	}
	seen := map[string]bool{}
	for _, r := range in.Reasons {
		if !reasons[r] {
			return f, "unknown reason"
		}
		if !seen[r] {
			seen[r] = true
			f.Reasons = append(f.Reasons, r)
		}
	}
	f.Section = clean(in.Section, 80)
	f.Note = clean(in.Note, 1000)
	return f, ""
}

// limiter allows `per` events per client in a sliding window, and `total` overall.
type limiter struct {
	mu     sync.Mutex
	window time.Duration
	per    int
	total  int
	hits   map[string][]time.Time
	all    []time.Time
}

func newLimiter(window time.Duration, per, total int) *limiter {
	return &limiter{window: window, per: per, total: total, hits: map[string][]time.Time{}}
}

func recent(ts []time.Time, since time.Time) []time.Time {
	i := 0
	for i < len(ts) && ts[i].Before(since) {
		i++
	}
	return ts[i:]
}

func (l *limiter) allow(client string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	since := now.Add(-l.window)
	l.all = recent(l.all, since)
	h := recent(l.hits[client], since)
	if len(h) >= l.per || len(l.all) >= l.total {
		l.hits[client] = h
		return false
	}
	l.hits[client] = append(h, now)
	l.all = append(l.all, now)
	if len(l.hits) > 10000 { // drop idle clients so memory stays bounded
		for k, v := range l.hits {
			if len(recent(v, since)) == 0 {
				delete(l.hits, k)
			}
		}
	}
	return true
}

type server struct {
	mu    sync.Mutex
	path  string
	salt  string
	limit *limiter
	now   func() time.Time
}

func clientIP(r *http.Request) string {
	// Traefik sets X-Real-Ip to the connecting address.
	if ip := strings.TrimSpace(r.Header.Get("X-Real-Ip")); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *server) hash(ip string) string {
	sum := sha256.Sum256([]byte(s.salt + ip))
	return hex.EncodeToString(sum[:6])
}

func (s *server) feedback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		http.Error(w, "json only", http.StatusUnsupportedMediaType)
		return
	}
	client := s.hash(clientIP(r))
	if !s.limit.allow(client, s.now()) {
		http.Error(w, "too many ratings, try later", http.StatusTooManyRequests)
		return
	}
	var in input
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&in); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	f, msg := in.validate()
	if msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	f.Time = s.now().UTC()
	f.Client = client
	if err := s.append(f); err != nil {
		log.Printf("append: %v", err)
		http.Error(w, "could not save", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) append(f Feedback) error {
	line, err := json.Marshal(f)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	fh, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	if _, err := fh.Write(append(line, '\n')); err != nil {
		fh.Close()
		return err
	}
	return fh.Close()
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/feedback", s.feedback)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	return mux
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	s := &server{
		path:  env("FEEDBACK_FILE", "/data/feedback.jsonl"),
		salt:  env("HASH_SALT", time.Now().String()),
		limit: newLimiter(time.Hour, 20, 600),
		now:   time.Now,
	}
	srv := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           s.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	log.Printf("feedback api on %s, writing %s", srv.Addr, s.path)
	log.Fatal(srv.ListenAndServe())
}
