package main

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"
)

func receiveWithin(b *Broker, topic string, d time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	msg, err := b.Receive(ctx, topic)
	return string(msg), err
}

func main() {
	before := runtime.NumGoroutine()

	check("send before any reader, FIFO", func() (any, any) {
		b := NewBroker()
		b.Send("t", []byte("one"))
		b.Send("t", []byte("two"))
		m1, _ := receiveWithin(b, "t", time.Second)
		m2, _ := receiveWithin(b, "t", time.Second)
		return []string{m1, m2}, []string{"one", "two"}
	})
	ok("topics are separate", func() (bool, string) {
		b := NewBroker()
		b.Send("orders", []byte("x"))
		type result struct {
			msg string
			err error
		}
		res := make(chan result, 1)
		go func() {
			msg, err := receiveWithin(b, "payments", 50*time.Millisecond)
			res <- result{msg, err}
		}()
		select {
		case r := <-res:
			return errors.Is(r.err, context.DeadlineExceeded), fmt.Sprintf("got %q, %v; want a deadline error", r.msg, r.err)
		case <-time.After(time.Second):
			return false, "Receive on an empty topic ignored the ctx deadline"
		}
	})
	ok("receive waits for a later send", func() (bool, string) {
		b := NewBroker()
		go func() {
			time.Sleep(20 * time.Millisecond)
			b.Send("t", []byte("late"))
		}()
		msg, err := receiveWithin(b, "t", time.Second)
		return msg == "late" && err == nil, fmt.Sprintf("got %q, %v", msg, err)
	})
	ok("cancel stops a waiting receive", func() (bool, string) {
		b := NewBroker()
		ctx, cancel := context.WithCancel(context.Background())
		res := make(chan error, 1)
		go func() {
			_, err := b.Receive(ctx, "t")
			res <- err
		}()
		time.Sleep(10 * time.Millisecond)
		cancel()
		select {
		case err := <-res:
			return errors.Is(err, context.Canceled), fmt.Sprintf("got %v, want context.Canceled", err)
		case <-time.After(time.Second):
			return false, "Receive kept blocking after cancel"
		}
	})
	ok("each message delivered exactly once", func() (bool, string) {
		b := NewBroker()
		const writers, perWriter, readers = 3, 100, 4
		var mu sync.Mutex
		seen := map[string]int{}
		var rw sync.WaitGroup
		for range readers {
			rw.Add(1)
			go func() {
				defer rw.Done()
				for range writers * perWriter {
					msg, err := receiveWithin(b, "t", 200*time.Millisecond)
					if err != nil {
						return
					}
					mu.Lock()
					seen[msg]++
					mu.Unlock()
				}
			}()
		}
		var ww sync.WaitGroup
		for w := range writers {
			ww.Add(1)
			go func() {
				defer ww.Done()
				for i := range perWriter {
					b.Send("t", fmt.Appendf(nil, "%d-%d", w, i))
				}
			}()
		}
		ww.Wait()
		finished := make(chan struct{})
		go func() { rw.Wait(); close(finished) }()
		select {
		case <-finished:
		case <-time.After(3 * time.Second):
			return false, "receivers never returned once their ctx deadline passed"
		}
		mu.Lock()
		defer mu.Unlock()
		for m, n := range seen {
			if n > 1 {
				return false, fmt.Sprintf("%q delivered %d times", m, n)
			}
		}
		return len(seen) == writers*perWriter, fmt.Sprintf("got %d distinct messages, want %d", len(seen), writers*perWriter)
	})
	ok("no goroutines left behind", func() (bool, string) {
		var now int
		for range 50 {
			time.Sleep(10 * time.Millisecond)
			if now = runtime.NumGoroutine(); now <= before {
				return true, ""
			}
		}
		return false, fmt.Sprintf("%d goroutines before, %d after", before, now)
	})
	done()
}
