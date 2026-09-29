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

// after succeeds with src after d, or fails with ctx.Err() if cancelled first.
func after(d time.Duration, src string) SearchFunc {
	return func(ctx context.Context, _ string) (Result, error) {
		select {
		case <-time.After(d):
			return Result{Source: src}, nil
		case <-ctx.Done():
			return Result{}, ctx.Err()
		}
	}
}

func failAfter(d time.Duration, err error) SearchFunc {
	return func(context.Context, string) (Result, error) {
		time.Sleep(d)
		return Result{}, err
	}
}

// deaf ignores ctx: it always takes d, then succeeds.
func deaf(d time.Duration) SearchFunc {
	return func(context.Context, string) (Result, error) {
		time.Sleep(d)
		return Result{Source: "deaf"}, nil
	}
}

func main() {
	bg := context.Background()
	e1, e2 := errors.New("e1"), errors.New("e2")

	ok("fastest success wins, right away", func() (bool, string) {
		start := time.Now()
		r, err := MultiSearch(bg, "q", []SearchFunc{after(time.Second, "slow"), failAfter(time.Millisecond, e1), after(10*time.Millisecond, "fast")})
		took := time.Since(start)
		return err == nil && r.Source == "fast" && took < 500*time.Millisecond, fmt.Sprintf("got %v, %v after %v; want {fast} quickly", r, err, took.Round(time.Millisecond))
	})
	ok("all fail: the last error", func() (bool, string) {
		_, err := MultiSearch(bg, "q", []SearchFunc{failAfter(30*time.Millisecond, e2), failAfter(5*time.Millisecond, e1)})
		return errors.Is(err, e2), fmt.Sprintf("got %v, want e2 (it arrived last)", err)
	})
	ok("caller's deadline wins", func() (bool, string) {
		ctx, cancel := context.WithTimeout(bg, 20*time.Millisecond)
		defer cancel()
		start := time.Now()
		_, err := MultiSearch(ctx, "q", []SearchFunc{deaf(300 * time.Millisecond)})
		took := time.Since(start)
		return errors.Is(err, context.DeadlineExceeded) && took < 200*time.Millisecond, fmt.Sprintf("got %v after %v, want context.DeadlineExceeded after ~20ms", err, took.Round(time.Millisecond))
	})
	ok("losers are cancelled", func() (bool, string) {
		saw := make(chan error, 1)
		loser := func(ctx context.Context, _ string) (Result, error) {
			<-ctx.Done()
			saw <- ctx.Err()
			return Result{}, ctx.Err()
		}
		MultiSearch(bg, "q", []SearchFunc{loser, after(time.Millisecond, "win")})
		select {
		case err := <-saw:
			return errors.Is(err, context.Canceled), fmt.Sprintf("loser saw %v", err)
		case <-time.After(time.Second):
			return false, "the losing search's ctx was never cancelled"
		}
	})
	ok("losers don't leak", func() (bool, string) {
		before := runtime.NumGoroutine()
		MultiSearch(bg, "q", []SearchFunc{after(time.Millisecond, "win"), deaf(20 * time.Millisecond), deaf(20 * time.Millisecond)})
		return settled(before), fmt.Sprintf("%d goroutines stuck after the losers finished", runtime.NumGoroutine()-before)
	})
	ok("no funcs: an error", func() (bool, string) {
		_, err := MultiSearch(bg, "q", nil)
		return err != nil, "got a nil error for an empty list"
	})
	done()
}
