package main

import (
	"fmt"
	"runtime"
	"sync/atomic"
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

func main() {
	ok("runs after d", func() (bool, string) {
		start := time.Now()
		ran := make(chan time.Duration, 1)
		Delay(30*time.Millisecond, func() { ran <- time.Since(start) })
		select {
		case took := <-ran:
			return took >= 30*time.Millisecond, fmt.Sprintf("ran after %v, want ≥ 30ms", took)
		case <-time.After(time.Second):
			return false, "fn never ran"
		}
	})
	ok("cancel before d: fn never runs", func() (bool, string) {
		var ran atomic.Bool
		cancel := Delay(20*time.Millisecond, func() { ran.Store(true) })
		stopped := cancel()
		time.Sleep(60 * time.Millisecond)
		return stopped && !ran.Load(), fmt.Sprintf("cancel() = %v (want true), fn ran = %v", stopped, ran.Load())
	})
	ok("cancel after fn ran returns false", func() (bool, string) {
		ran := make(chan struct{})
		cancel := Delay(time.Millisecond, func() { close(ran) })
		select {
		case <-ran:
		case <-time.After(time.Second):
			return false, "fn never ran"
		}
		return !cancel(), "cancel() returned true although fn already ran"
	})
	ok("no goroutine waits after cancel", func() (bool, string) {
		before := runtime.NumGoroutine()
		for range 10 {
			Delay(time.Hour, func() {})()
		}
		return settled(before), fmt.Sprintf("%d goroutines still waiting after cancel", runtime.NumGoroutine()-before)
	})
	done()
}
