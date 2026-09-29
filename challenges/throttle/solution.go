package main

import (
	"errors"
	"sync"
	"time"
)

var (
	ErrBusy     = errors.New("busy")
	ErrCanceled = errors.New("canceled")
)

func Throttle(limit int, fn func()) (handle func() error, cancel func()) {
	tokens := make(chan struct{}, limit)
	for range limit {
		tokens <- struct{}{}
	}
	done := make(chan struct{})

	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-t.C:
			refill:
				for range limit {
					select {
					case tokens <- struct{}{}:
					default:
						break refill
					}
				}
			case <-done:
				return
			}
		}
	}()

	handle = func() error {
		select {
		case <-done:
			return ErrCanceled
		default:
		}
		select {
		case <-tokens:
			fn()
			return nil
		default:
			return ErrBusy
		}
	}
	var once sync.Once
	cancel = func() { once.Do(func() { close(done) }) }
	return handle, cancel
}
