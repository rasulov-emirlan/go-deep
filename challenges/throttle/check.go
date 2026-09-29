package main

import (
	"errors"
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

// calls runs handle n times and counts successes and ErrBusy.
func calls(handle func() error, n int) (okN, busy int) {
	for range n {
		switch err := handle(); {
		case err == nil:
			okN++
		case errors.Is(err, ErrBusy):
			busy++
		}
	}
	return
}

func main() {
	check("8 calls, limit 5: 5 run, 3 busy", func() (any, any) {
		var ran atomic.Int32
		handle, cancel := Throttle(5, func() { ran.Add(1) })
		defer cancel()
		okN, busy := calls(handle, 8)
		return [3]int{okN, busy, int(ran.Load())}, [3]int{5, 3, 5}
	})
	check("refills after a second", func() (any, any) {
		handle, cancel := Throttle(3, func() {})
		defer cancel()
		calls(handle, 5)
		time.Sleep(1100 * time.Millisecond)
		okN, busy := calls(handle, 5)
		return [2]int{okN, busy}, [2]int{3, 2}
	})
	ok("after cancel: ErrCanceled, fn not run", func() (bool, string) {
		var ran atomic.Int32
		handle, cancel := Throttle(5, func() { ran.Add(1) })
		cancel()
		err := handle()
		return errors.Is(err, ErrCanceled) && ran.Load() == 0, fmt.Sprintf("got %v (fn ran %d times), want ErrCanceled", err, ran.Load())
	})
	ok("cancel twice doesn't panic", func() (bool, string) {
		_, cancel := Throttle(1, func() {})
		cancel()
		cancel()
		return true, ""
	})
	ok("cancel stops the background goroutine", func() (bool, string) {
		before := runtime.NumGoroutine()
		handle, cancel := Throttle(2, func() {})
		handle()
		cancel()
		return settled(before), fmt.Sprintf("%d goroutines still running after cancel", runtime.NumGoroutine()-before)
	})
	done()
}
