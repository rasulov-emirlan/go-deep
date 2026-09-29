package main

import (
	"context"
	"fmt"
	"runtime"
	"sync/atomic"
	"time"
)

// drain reads until out closes; closed is false if that takes over a second.
func drain(out <-chan int) (got []int, closed bool) {
	timeout := time.After(time.Second)
	for {
		select {
		case v, open := <-out:
			if !open {
				return got, true
			}
			got = append(got, v)
		case <-timeout:
			return got, false
		}
	}
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

func square(v int) int { return v * v }

func upTo(n int) []int {
	var s []int
	for i := 1; i <= n; i++ {
		s = append(s, i)
	}
	return s
}

func main() {
	bg := context.Background()
	check("gen → map, in order", func() (any, any) {
		got, _ := drain(Map(bg, Gen(bg, 1, 2, 3, 4), square))
		return got, []int{1, 4, 9, 16}
	})
	ok("empty input closes both stages", func() (bool, string) {
		got, closed := drain(Map(bg, Gen(bg), square))
		return closed && len(got) == 0, fmt.Sprintf("closed=%v, got %v", closed, got)
	})
	ok("cancel stops the work", func() (bool, string) {
		ctx, cancel := context.WithCancel(bg)
		var calls atomic.Int32
		out := Map(ctx, Gen(ctx, upTo(1000)...), func(v int) int { calls.Add(1); return v })
		for range 3 {
			select {
			case <-out:
			case <-time.After(time.Second):
				cancel()
				return false, "no values arrived"
			}
		}
		cancel()
		atCancel := calls.Load()
		got, closed := drain(out)
		extra := calls.Load() - atCancel
		return closed && extra <= 1, fmt.Sprintf("after cancel: f ran %d more times (want ≤ 1), %d values sent, closed=%v", extra, len(got), closed)
	})
	ok("cancel with nobody reading: no leak", func() (bool, string) {
		before := runtime.NumGoroutine()
		ctx, cancel := context.WithCancel(bg)
		Map(ctx, Gen(ctx, upTo(100)...), square)
		time.Sleep(10 * time.Millisecond)
		cancel()
		return settled(before), fmt.Sprintf("%d goroutines still running after cancel", runtime.NumGoroutine()-before)
	})
	ok("stops even if its input never closes", func() (bool, string) {
		ctx, cancel := context.WithCancel(bg)
		out := Map(ctx, make(chan int), square)
		cancel()
		_, closed := drain(out)
		return closed, "Map's output not closed after cancel"
	})
	ok("already cancelled: f never runs", func() (bool, string) {
		ctx, cancel := context.WithCancel(bg)
		cancel()
		var calls atomic.Int32
		drain(Map(ctx, Gen(ctx, 1, 2, 3), func(v int) int { calls.Add(1); return v }))
		return calls.Load() == 0, fmt.Sprintf("f ran %d times on a cancelled ctx", calls.Load())
	})
	done()
}
