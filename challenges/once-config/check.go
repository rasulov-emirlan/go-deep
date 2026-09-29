package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

func counted() (func() *Config, *atomic.Int32) {
	var n atomic.Int32
	return func() *Config {
		n.Add(1)
		time.Sleep(5 * time.Millisecond)
		return &Config{Host: "localhost", Port: 8080}
	}, &n
}

func main() {
	ok("load waits for the first call", func() (bool, string) {
		load, n := counted()
		NewGetter(load)
		return n.Load() == 0, "load ran before anyone asked for the config"
	})
	check("returns the loaded config", func() (any, any) {
		load, _ := counted()
		return *NewGetter(load)(), Config{Host: "localhost", Port: 8080}
	})
	ok("same pointer every call", func() (bool, string) {
		load, n := counted()
		get := NewGetter(load)
		a, b := get(), get()
		return a == b && n.Load() == 1, fmt.Sprintf("same pointer: %v, load ran %d times", a == b, n.Load())
	})
	ok("100 concurrent callers, one load", func() (bool, string) {
		load, n := counted()
		get := NewGetter(load)
		if get == nil {
			return false, "NewGetter returned nil"
		}
		got := make([]*Config, 100)
		var wg sync.WaitGroup
		for i := range got {
			wg.Go(func() { got[i] = get() })
		}
		wg.Wait()
		for _, c := range got {
			if c == nil || c != got[0] {
				return false, "callers got different (or nil) pointers"
			}
		}
		return n.Load() == 1, fmt.Sprintf("load ran %d times, want 1", n.Load())
	})
	done()
}
