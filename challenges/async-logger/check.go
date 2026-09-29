package main

import (
	"errors"
	"fmt"
	"runtime"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// sink is a fake Logger. Writes wait on gate (if set) and are recorded.
type sink struct {
	mu        sync.Mutex
	gate      chan struct{}
	got       []string
	closes    int
	lateWrite bool
}

func (s *sink) Log(m string) error {
	if s.gate != nil {
		<-s.gate
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closes > 0 {
		s.lateWrite = true
	}
	s.got = append(s.got, m)
	return nil
}

func (s *sink) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closes++
	return nil
}

func (s *sink) snapshot() ([]string, int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.got), s.closes, s.lateWrite
}

func settled(before int) bool {
	for range 100 {
		if runtime.NumGoroutine() <= before {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func within(d time.Duration, f func()) bool {
	finished := make(chan struct{})
	go func() {
		f()
		close(finished)
	}()
	select {
	case <-finished:
		return true
	case <-time.After(d):
		return false
	}
}

func main() {
	ok("in order, all flushed by Close", func() (bool, string) {
		s := &sink{}
		l := NewAsyncLogger(s, 4)
		var want []string
		for i := range 10 {
			m := "m" + strconv.Itoa(i)
			want = append(want, m)
			l.Log(m)
		}
		if !within(time.Second, func() { l.Close() }) {
			return false, "Close hung"
		}
		got, closes, _ := s.snapshot()
		return slices.Equal(got, want) && closes == 1, fmt.Sprintf("next got %v and was closed %d times; want %v, closed once", got, closes, want)
	})
	ok("Log doesn't wait for a slow writer", func() (bool, string) {
		s := &sink{gate: make(chan struct{})}
		l := NewAsyncLogger(s, 3)
		fast := within(time.Second, func() {
			for i := range 3 {
				l.Log(strconv.Itoa(i))
			}
		})
		close(s.gate)
		l.Close()
		return fast, "Log blocked on the slow writer although the buffer had room"
	})
	ok("Log after Close: ErrClosed", func() (bool, string) {
		s := &sink{}
		l := NewAsyncLogger(s, 2)
		l.Close()
		err := l.Log("late")
		got, _, _ := s.snapshot()
		return errors.Is(err, ErrClosed) && len(got) == 0, fmt.Sprintf("got %v (and next received %v), want ErrClosed", err, got)
	})
	ok("Close twice is fine", func() (bool, string) {
		s := &sink{}
		l := NewAsyncLogger(s, 2)
		var err1, err2 error
		if !within(time.Second, func() { err1, err2 = l.Close(), l.Close() }) {
			return false, "second Close hung"
		}
		_, closes, _ := s.snapshot()
		return err1 == nil && err2 == nil && closes == 1, fmt.Sprintf("errors %v, %v; next closed %d times, want once", err1, err2, closes)
	})
	ok("Close during concurrent Logs", func() (bool, string) {
		s := &sink{}
		l := NewAsyncLogger(s, 8)
		var wg sync.WaitGroup
		var bad atomic.Int32
		for g := range 8 {
			wg.Go(func() {
				for i := range 200 {
					if err := l.Log(strconv.Itoa(g*1000 + i)); err != nil && !errors.Is(err, ErrClosed) {
						bad.Add(1)
					}
				}
			})
		}
		time.Sleep(time.Millisecond)
		l.Close()
		wg.Wait()
		_, closes, late := s.snapshot()
		n := bad.Load()
		return n == 0 && closes == 1 && !late, fmt.Sprintf("unexpected errors: %d, next closed %d times, write after close: %v", n, closes, late)
	})
	ok("no goroutine left after Close", func() (bool, string) {
		before := runtime.NumGoroutine()
		l := NewAsyncLogger(&sink{}, 2)
		l.Log("x")
		l.Close()
		return settled(before), fmt.Sprintf("%d goroutines still running after Close", runtime.NumGoroutine()-before)
	})
	done()
}
