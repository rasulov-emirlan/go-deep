package main

import (
	"context"
	"fmt"
	"runtime"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

func feed(ids ...int) <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for _, id := range ids {
			ch <- id
		}
	}()
	return ch
}

// endless sends 1, 2, 3, ... until stop is closed.
func endless(stop <-chan struct{}) <-chan int {
	ch := make(chan int)
	go func() {
		for i := 1; ; i++ {
			select {
			case ch <- i:
			case <-stop:
				return
			}
		}
	}()
	return ch
}

// drain reads until out closes; closed is false if that takes over a second.
func drain(out <-chan Order) (got []int, closed bool) {
	timeout := time.After(time.Second)
	for {
		select {
		case o, open := <-out:
			if !open {
				return got, true
			}
			got = append(got, o.CourierID)
		case <-timeout:
			return got, false
		}
	}
}

// probe is a fake get that tracks how many calls overlap. Each call waits
// (briefly) until k calls are in flight together.
type probe struct {
	k            int32
	cur, peak, n atomic.Int32
	full         chan struct{}
	once         sync.Once
}

func newProbe(k int) *probe { return &probe{k: int32(k), full: make(chan struct{})} }

func (p *probe) get(id int) Order {
	p.n.Add(1)
	c := p.cur.Add(1)
	defer p.cur.Add(-1)
	for m := p.peak.Load(); c > m && !p.peak.CompareAndSwap(m, c); m = p.peak.Load() {
	}
	if c >= p.k {
		p.once.Do(func() { close(p.full) })
	}
	select {
	case <-p.full:
		time.Sleep(time.Millisecond)
	case <-time.After(50 * time.Millisecond):
	}
	return Order{CourierID: id}
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

func main() {
	bg := context.Background()
	check("an order for every id", func() (any, any) {
		got, _ := drain(FetchOrders(bg, feed(1, 2, 3, 4, 5, 6, 7), 3, newProbe(3).get))
		slices.Sort(got)
		return got, []int{1, 2, 3, 4, 5, 6, 7}
	})
	ok("closes when ids close", func() (bool, string) {
		got, closed := drain(FetchOrders(bg, feed(), 2, newProbe(2).get))
		return closed && len(got) == 0, fmt.Sprintf("closed=%v, got %v", closed, got)
	})
	ok("at most `workers` calls at once", func() (bool, string) {
		p := newProbe(4)
		got, _ := drain(FetchOrders(bg, feed(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), 4, p.get))
		return len(got) == 12 && p.peak.Load() == 4, fmt.Sprintf("peak %d calls in flight, want exactly 4", p.peak.Load())
	})
	ok("cancel stops new calls", func() (bool, string) {
		stop := make(chan struct{})
		defer close(stop)
		ctx, cancel := context.WithCancel(bg)
		p := newProbe(3)
		out := FetchOrders(ctx, endless(stop), 3, p.get)
		for range 3 {
			select {
			case <-out:
			case <-time.After(time.Second):
				cancel()
				return false, "no orders arrived"
			}
		}
		cancel()
		atCancel := p.n.Load()
		drain(out)
		after := p.n.Load() - atCancel
		return after <= 3, fmt.Sprintf("%d get calls started after cancel, want ≤ 3 (one in flight per worker)", after)
	})
	ok("cancel with nobody reading: no leak, output closed", func() (bool, string) {
		stop := make(chan struct{})
		before := runtime.NumGoroutine()
		ctx, cancel := context.WithCancel(bg)
		out := FetchOrders(ctx, endless(stop), 3, newProbe(3).get)
		time.Sleep(10 * time.Millisecond)
		cancel()
		close(stop)
		if !settled(before) {
			return false, fmt.Sprintf("%d goroutines still running after cancel", runtime.NumGoroutine()-before)
		}
		select {
		case _, open := <-out:
			return !open, "output not closed after cancel"
		case <-time.After(time.Second):
			return false, "output not closed after cancel"
		}
	})
	done()
}
