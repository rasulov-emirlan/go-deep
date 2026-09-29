package main

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"time"
)

func settled(before int) bool {
	for range 100 {
		if runtime.NumGoroutine() <= before {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

// blocked returns an f that waits for release, and the release func.
func blocked(v int64) (func() int64, func()) {
	ch := make(chan struct{})
	return func() int64 { <-ch; return v }, func() { close(ch) }
}

// call runs WithTimeout with a one-second safety limit.
func call(ctx context.Context, d time.Duration, f func() int64) (v int64, took time.Duration, err error) {
	start := time.Now()
	type out struct {
		v   int64
		err error
	}
	res := make(chan out, 1)
	go func() {
		v, err := WithTimeout(ctx, d, f)
		res <- out{v, err}
	}()
	select {
	case o := <-res:
		return o.v, time.Since(start), o.err
	case <-time.After(time.Second):
		return 0, time.Since(start), errors.New("still waiting after a second")
	}
}

func main() {
	bg := context.Background()
	check("fast call returns its result", func() (any, any) {
		v, _, err := call(bg, 100*time.Millisecond, func() int64 { return 42 })
		return []any{v, err}, []any{int64(42), nil}
	})
	ok("slow call times out", func() (bool, string) {
		f, release := blocked(7)
		defer release()
		v, took, err := call(bg, 20*time.Millisecond, f)
		return v == 0 && errors.Is(err, context.DeadlineExceeded) && took < 300*time.Millisecond,
			fmt.Sprintf("got %d, %v after %v; want 0, context.DeadlineExceeded after ~20ms", v, err, took.Round(time.Millisecond))
	})
	ok("parent cancel wins", func() (bool, string) {
		f, release := blocked(7)
		defer release()
		ctx, cancel := context.WithCancel(bg)
		go func() {
			time.Sleep(10 * time.Millisecond)
			cancel()
		}()
		_, _, err := call(ctx, time.Hour, f)
		return errors.Is(err, context.Canceled), fmt.Sprintf("got %v, want context.Canceled", err)
	})
	ok("no goroutine stuck after f finishes", func() (bool, string) {
		before := runtime.NumGoroutine()
		f, release := blocked(7)
		call(bg, 10*time.Millisecond, f)
		release()
		return settled(before), fmt.Sprintf("%d goroutines stuck after f finished", runtime.NumGoroutine()-before)
	})
	done()
}
