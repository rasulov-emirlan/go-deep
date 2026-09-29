package main

import (
	"fmt"
	"strconv"
	"sync"
)

// has reports which of the keys are present, in order.
func has(c *LRU, keys ...string) []bool {
	var out []bool
	for _, k := range keys {
		_, ok := c.Get(k)
		out = append(out, ok)
	}
	return out
}

func main() {
	check("set then get", func() (any, any) {
		c := NewLRU(2)
		c.Set("a", "1")
		v, ok := c.Get("a")
		_, missing := c.Get("zzz")
		return []any{v, ok, missing}, []any{"1", true, false}
	})
	check("Set overwrites without growing", func() (any, any) {
		c := NewLRU(2)
		c.Set("a", "1")
		c.Set("b", "2")
		c.Set("a", "3")
		v, _ := c.Get("a")
		return []any{v, has(c, "b")[0]}, []any{"3", true}
	})
	check("evicts the least recently used", func() (any, any) {
		c := NewLRU(2)
		c.Set("a", "1")
		c.Set("b", "2")
		c.Get("a")
		c.Set("c", "3")
		return has(c, "a", "b", "c"), []bool{true, false, true}
	})
	check("Set counts as a use", func() (any, any) {
		c := NewLRU(2)
		c.Set("a", "1")
		c.Set("b", "2")
		c.Set("a", "1!")
		c.Set("c", "3")
		return has(c, "a", "b", "c"), []bool{true, false, true}
	})
	check("capacity 1", func() (any, any) {
		c := NewLRU(1)
		c.Set("a", "1")
		c.Set("b", "2")
		return has(c, "a", "b"), []bool{false, true}
	})
	ok("safe for concurrent use", func() (bool, string) {
		c := NewLRU(50)
		var wg sync.WaitGroup
		bad := make([]bool, 8)
		for g := range 8 {
			wg.Go(func() {
				for i := range 500 {
					k := strconv.Itoa(g*1000 + i%20)
					c.Set(k, k)
					if v, ok := c.Get(k); ok && v != k {
						bad[g] = true
					}
				}
			})
		}
		wg.Wait()
		for g, b := range bad {
			if b {
				return false, fmt.Sprintf("goroutine %d read a wrong value", g)
			}
		}
		n := 0
		for g := range 8 {
			for i := range 20 {
				if _, ok := c.Get(strconv.Itoa(g*1000 + i)); ok {
					n++
				}
			}
		}
		return n == 50, fmt.Sprintf("%d entries survived, want exactly 50 (the capacity)", n)
	})
	done()
}
