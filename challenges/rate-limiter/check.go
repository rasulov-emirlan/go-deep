package main

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// timed runs n Waits spread over g goroutines and reports how long they took.
func timed(l *Limiter, g, n int) (time.Duration, error) {
	start := time.Now()
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for range g {
		wg.Go(func() {
			for range n / g {
				errs <- l.Wait(context.Background())
			}
		})
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			return 0, err
		}
	}
	return time.Since(start), nil
}

func main() {
	ok("10 calls at 100 rps take ~100ms", func() (bool, string) {
		l := NewLimiter(100)
		defer l.Stop()
		d, err := timed(l, 1, 10)
		return err == nil && d >= 90*time.Millisecond && d < 600*time.Millisecond,
			fmt.Sprintf("took %v (err %v), want about 100ms", d.Round(time.Millisecond), err)
	})
	ok("the limit is shared between goroutines", func() (bool, string) {
		l := NewLimiter(200)
		defer l.Stop()
		d, err := timed(l, 5, 20)
		return err == nil && d >= 95*time.Millisecond && d < 600*time.Millisecond,
			fmt.Sprintf("20 calls from 5 goroutines took %v (err %v), want about 100ms", d.Round(time.Millisecond), err)
	})
	ok("no burst after idling", func() (bool, string) {
		l := NewLimiter(50)
		defer l.Stop()
		time.Sleep(210 * time.Millisecond)
		d, err := timed(l, 1, 6)
		return err == nil && d >= 70*time.Millisecond,
			fmt.Sprintf("6 calls after a pause took %v (err %v), want about 100ms", d.Round(time.Millisecond), err)
	})
	ok("Wait honours ctx", func() (bool, string) {
		l := NewLimiter(2)
		defer l.Stop()
		l.Wait(context.Background())
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		defer cancel()
		start := time.Now()
		err := l.Wait(ctx)
		return errors.Is(err, context.DeadlineExceeded) && time.Since(start) < 300*time.Millisecond,
			fmt.Sprintf("got %v after %v, want context.DeadlineExceeded after ~20ms", err, time.Since(start).Round(time.Millisecond))
	})
	done()
}
