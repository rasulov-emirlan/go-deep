package main

import (
	"errors"
	"fmt"
	"io"
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing/iotest"
	"time"
)

// sink records writes and notices when two Writes overlap.
type sink struct {
	mu       sync.Mutex
	data     []byte
	inFlight atomic.Int32
	overlap  atomic.Bool
	onWrite  func(all string)
}

func (s *sink) Write(p []byte) (int, error) {
	if s.inFlight.Add(1) > 1 {
		s.overlap.Store(true)
	}
	time.Sleep(time.Millisecond)
	s.mu.Lock()
	s.data = append(s.data, p...)
	all := string(s.data)
	s.mu.Unlock()
	s.inFlight.Add(-1)
	if s.onWrite != nil {
		s.onWrite(all)
	}
	return len(p), nil
}

func sortedBytes(s string) string {
	b := []byte(s)
	slices.Sort(b)
	return string(b)
}

// forwardWithin runs Forward and gives up after a while instead of hanging.
func forwardWithin(a, b io.Reader, out io.Writer) (error, bool) {
	res := make(chan error, 1)
	go func() { res <- Forward(a, b, out) }()
	select {
	case err := <-res:
		return err, true
	case <-time.After(2 * time.Second):
		return nil, false
	}
}

func main() {
	ok("copies both readers", func() (bool, string) {
		out := &sink{}
		a := iotest.HalfReader(strings.NewReader(strings.Repeat("a", 500)))
		b := iotest.OneByteReader(strings.NewReader(strings.Repeat("b", 300)))
		if err, finished := forwardWithin(a, b, out); !finished || err != nil {
			return false, fmt.Sprintf("finished=%v err=%v", finished, err)
		}
		want := strings.Repeat("a", 500) + strings.Repeat("b", 300)
		return sortedBytes(string(out.data)) == want, fmt.Sprintf("got %d bytes, want 800 (500 a, 300 b)", len(out.data))
	})
	ok("reads both at the same time", func() (bool, string) {
		// a only gets its data after b's data has reached out.
		pr, pw := io.Pipe()
		out := &sink{}
		var once sync.Once
		out.onWrite = func(all string) {
			if strings.Contains(all, "world") {
				once.Do(func() {
					go func() { pw.Write([]byte("hello")); pw.Close() }()
				})
			}
		}
		err, finished := forwardWithin(pr, strings.NewReader("world"), out)
		if !finished {
			pw.CloseWithError(errors.New("give up"))
			return false, "Forward blocked on the first reader and never read the second"
		}
		return err == nil && sortedBytes(string(out.data)) == sortedBytes("helloworld"), fmt.Sprintf("got %q, err %v", out.data, err)
	})
	ok("writes to out never overlap", func() (bool, string) {
		out := &sink{}
		a := iotest.OneByteReader(strings.NewReader(strings.Repeat("x", 200)))
		b := iotest.OneByteReader(strings.NewReader(strings.Repeat("y", 200)))
		forwardWithin(a, b, out)
		return !out.overlap.Load(), "two goroutines called out.Write at the same time"
	})
	ok("returns a reader error", func() (bool, string) {
		boom := errors.New("socket reset")
		err, _ := forwardWithin(strings.NewReader("ok"), iotest.ErrReader(boom), &sink{})
		return errors.Is(err, boom), fmt.Sprintf("got error %v, want one wrapping %q", err, boom)
	})
	ok("no goroutines left behind", func() (bool, string) {
		before := runtime.NumGoroutine()
		forwardWithin(strings.NewReader("a"), strings.NewReader("b"), &sink{})
		var now int
		for range 50 {
			time.Sleep(10 * time.Millisecond)
			if now = runtime.NumGoroutine(); now <= before {
				return true, ""
			}
		}
		return false, fmt.Sprintf("%d goroutines before, %d after", before, now)
	})
	done()
}
