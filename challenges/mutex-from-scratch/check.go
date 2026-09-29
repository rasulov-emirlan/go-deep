package main

import (
	"runtime"
	"sync"
)

// arrived polls ch, yielding between tries.
func arrived(ch <-chan struct{}, tries int) bool {
	for range tries {
		select {
		case <-ch:
			return true
		default:
			runtime.Gosched()
		}
	}
	return false
}

func main() {
	check("guards a counter", func() (any, any) {
		var m Mutex
		n := 0
		var wg sync.WaitGroup
		for range 20 {
			wg.Go(func() {
				for range 500 {
					m.Lock()
					n++
					m.Unlock()
				}
			})
		}
		wg.Wait()
		return n, 10000
	})
	check("TryLock: free, then held", func() (any, any) {
		var m Mutex
		return []bool{m.TryLock(), m.TryLock()}, []bool{true, false}
	})
	check("TryLock after Unlock", func() (any, any) {
		var m Mutex
		m.Lock()
		m.Unlock()
		return m.TryLock(), true
	})
	ok("Lock waits for Unlock", func() (bool, string) {
		// No timers here: a spinning Lock never lets the Playground's fake clock advance.
		var m Mutex
		m.Lock()
		got := make(chan struct{})
		go func() {
			m.Lock()
			close(got)
		}()
		if arrived(got, 200) {
			return false, "second Lock didn't wait"
		}
		m.Unlock()
		return arrived(got, 1_000_000), "Lock still blocked after Unlock"
	})
	ok("Unlock of an unlocked mutex panics", func() (pass bool, why string) {
		defer func() {
			if recover() != nil {
				pass = true
			}
		}()
		var m Mutex
		m.Unlock()
		return false, "no panic"
	})
	done()
}
