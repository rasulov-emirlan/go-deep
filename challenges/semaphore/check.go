package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	check("TryAcquire takes n slots", func() (any, any) {
		s := NewSemaphore(2)
		return []bool{s.TryAcquire(), s.TryAcquire(), s.TryAcquire()}, []bool{true, true, false}
	})
	ok("Release frees a slot", func() (bool, string) {
		s := NewSemaphore(1)
		first := s.TryAcquire()
		full := !s.TryAcquire()
		s.Release()
		return first && full && s.TryAcquire(), "after Release, TryAcquire should succeed again"
	})
	ok("Acquire waits for Release", func() (bool, string) {
		s := NewSemaphore(1)
		if err := s.Acquire(context.Background()); err != nil {
			return false, "first Acquire failed: " + err.Error()
		}
		got := make(chan struct{})
		go func() {
			s.Acquire(context.Background())
			close(got)
		}()
		select {
		case <-got:
			return false, "second Acquire didn't wait while the only slot was taken"
		case <-time.After(20 * time.Millisecond):
		}
		s.Release()
		select {
		case <-got:
			return true, ""
		case <-time.After(time.Second):
			return false, "Acquire still blocked after Release"
		}
	})
	ok("Acquire gives up when ctx ends", func() (bool, string) {
		s := NewSemaphore(1)
		s.TryAcquire()
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		defer cancel()
		res := make(chan error, 1)
		go func() { res <- s.Acquire(ctx) }()
		select {
		case err := <-res:
			return errors.Is(err, context.DeadlineExceeded), fmt.Sprintf("got %v, want context.DeadlineExceeded", err)
		case <-time.After(time.Second):
			return false, "Acquire ignored the ctx deadline"
		}
	})
	ok("at most n run at once", func() (bool, string) {
		const n = 3
		s := NewSemaphore(n)
		var cur, peak atomic.Int32
		var wg sync.WaitGroup
		for range 20 {
			wg.Go(func() {
				if s.Acquire(context.Background()) != nil {
					return
				}
				defer s.Release()
				c := cur.Add(1)
				for m := peak.Load(); c > m && !peak.CompareAndSwap(m, c); m = peak.Load() {
				}
				time.Sleep(2 * time.Millisecond)
				cur.Add(-1)
			})
		}
		wg.Wait()
		return peak.Load() >= 1 && peak.Load() <= n, fmt.Sprintf("peak %d running at once, want ≤ %d", peak.Load(), n)
	})
	done()
}
