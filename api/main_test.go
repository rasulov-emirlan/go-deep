package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTest(t *testing.T) (*server, http.Handler) {
	t.Helper()
	now := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	s := &server{path: filepath.Join(t.TempDir(), "f.jsonl"), salt: "x", limit: newLimiter(time.Hour, 3, 100), now: func() time.Time { return now }}
	return s, s.routes()
}

func post(h http.Handler, body, ip string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/feedback", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Real-Ip", ip)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func lines(t *testing.T, path string) []Feedback {
	t.Helper()
	fh, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	defer fh.Close()
	var out []Feedback
	sc := bufio.NewScanner(fh)
	for sc.Scan() {
		var f Feedback
		if err := json.Unmarshal(sc.Bytes(), &f); err != nil {
			t.Fatal(err)
		}
		out = append(out, f)
	}
	return out
}

func TestStoresADislikeWithReasons(t *testing.T) {
	s, h := newTest(t)
	w := post(h, `{"topic":"gc","vote":"down","reasons":["too-complicated","too-complicated","wrong"],"section":"Why marking needs a write barrier","note":"  lost me at\u0007 frame 3\n"}`, "1.2.3.4")
	if w.Code != http.StatusNoContent {
		t.Fatalf("code %d: %s", w.Code, w.Body)
	}
	got := lines(t, s.path)
	if len(got) != 1 {
		t.Fatalf("got %d lines", len(got))
	}
	f := got[0]
	if f.Topic != "gc" || f.Vote != "down" || len(f.Reasons) != 2 || f.Note != "lost me at frame 3" || f.Client == "" || strings.Contains(f.Client, "1.2.3.4") {
		t.Fatalf("stored %+v", f)
	}
}

func TestRejectsBadInput(t *testing.T) {
	s, h := newTest(t)
	for i, body := range []string{
		`{"topic":"../etc","vote":"up"}`,
		`{"topic":"gc","vote":"meh"}`,
		`{"topic":"gc","vote":"down","reasons":["rm -rf"]}`,
		`{"topic":"gc","vote":"up","admin":true}`,
		`not json`,
		`{"topic":"gc","vote":"up","note":"` + strings.Repeat("a", 5000) + `"}`,
	} {
		if w := post(h, body, fmt.Sprint("10.0.0.", i)); w.Code != http.StatusBadRequest {
			t.Errorf("%.40s: code %d", body, w.Code)
		}
	}
	if n := len(lines(t, s.path)); n != 0 {
		t.Fatalf("stored %d bad lines", n)
	}
}

func TestCapsLongNotes(t *testing.T) {
	s, h := newTest(t)
	post(h, `{"topic":"gc","vote":"down","note":"`+strings.Repeat("é", 1500)+`"}`, "1.1.1.1")
	if got := lines(t, s.path); len(got) != 1 || len([]rune(got[0].Note)) != 1000 {
		t.Fatalf("note not capped: %d lines", len(got))
	}
}

func TestRateLimitsPerClient(t *testing.T) {
	_, h := newTest(t)
	for i := 0; i < 3; i++ {
		if w := post(h, `{"topic":"gc","vote":"up"}`, "9.9.9.9"); w.Code != http.StatusNoContent {
			t.Fatalf("request %d: %d", i, w.Code)
		}
	}
	if w := post(h, `{"topic":"gc","vote":"up"}`, "9.9.9.9"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("4th request: %d", w.Code)
	}
	if w := post(h, `{"topic":"gc","vote":"up"}`, "8.8.8.8"); w.Code != http.StatusNoContent {
		t.Fatalf("other client: %d", w.Code)
	}
}

func TestLimiterWindowSlides(t *testing.T) {
	l := newLimiter(time.Hour, 1, 10)
	t0 := time.Now()
	if !l.allow("a", t0) || l.allow("a", t0.Add(time.Minute)) {
		t.Fatal("first allowed, second in window refused")
	}
	if !l.allow("a", t0.Add(61*time.Minute)) {
		t.Fatal("allowed again after the window")
	}
}

func TestOnlyPostAndJSON(t *testing.T) {
	_, h := newTest(t)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/feedback", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET: %d", w.Code)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/feedback", strings.NewReader(`{"topic":"gc","vote":"up"}`))
	r.Header.Set("Content-Type", "text/plain")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("text/plain: %d", w.Code)
	}
}
