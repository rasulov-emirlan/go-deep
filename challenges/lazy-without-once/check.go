package main

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

var errDown = errors.New("config server down")

// loader fails its first `fails` calls and tracks calls and overlap.
type loader struct {
	fails        int32
	n, cur, peak atomic.Int32
}

func (l *loader) load() (*Config, error) {
	i := l.n.Add(1)
	c := l.cur.Add(1)
	defer l.cur.Add(-1)
	for m := l.peak.Load(); c > m && !l.peak.CompareAndSwap(m, c); m = l.peak.Load() {
	}
	time.Sleep(2 * time.Millisecond)
	if i <= l.fails {
		return nil, errDown
	}
	return &Config{Host: "localhost", Port: 8080}, nil
}

func main() {
	ok("lazy until the first Get", func() (bool, string) {
		l := &loader{}
		NewLazy(l.load)
		return l.n.Load() == 0, "load ran before Get"
	})
	ok("loads once, same pointer", func() (bool, string) {
		l := &loader{}
		z := NewLazy(l.load)
		a, _ := z.Get()
		b, _ := z.Get()
		return a != nil && a == b && l.n.Load() == 1, fmt.Sprintf("load ran %d times, same pointer: %v", l.n.Load(), a != nil && a == b)
	})
	ok("100 concurrent Gets, one load", func() (bool, string) {
		l := &loader{}
		z := NewLazy(l.load)
		got := make([]*Config, 100)
		var wg sync.WaitGroup
		for i := range got {
			wg.Go(func() { got[i], _ = z.Get() })
		}
		wg.Wait()
		for _, c := range got {
			if c == nil || c != got[0] {
				return false, "callers got different (or nil) pointers"
			}
		}
		return l.n.Load() == 1, fmt.Sprintf("load ran %d times, want 1", l.n.Load())
	})
	ok("a failed load is retried", func() (bool, string) {
		l := &loader{fails: 1}
		z := NewLazy(l.load)
		_, err1 := z.Get()
		c, err2 := z.Get()
		return errors.Is(err1, errDown) && err2 == nil && c != nil,
			fmt.Sprintf("first Get: %v (want errDown), second Get: %v, %v", err1, c, err2)
	})
	ok("loads never overlap", func() (bool, string) {
		l := &loader{fails: 1000}
		z := NewLazy(l.load)
		var wg sync.WaitGroup
		for range 20 {
			wg.Go(func() { z.Get() })
		}
		wg.Wait()
		return l.n.Load() == 20 && l.peak.Load() == 1, fmt.Sprintf("%d loads (want 20: every failure retries), peak %d at once (want 1)", l.n.Load(), l.peak.Load())
	})
	done()
}
