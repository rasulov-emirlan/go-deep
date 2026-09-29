package main

import "context"

type Semaphore struct {
	slots chan struct{}
}

func NewSemaphore(n int) *Semaphore {
	return &Semaphore{slots: make(chan struct{}, n)}
}

func (s *Semaphore) Acquire(ctx context.Context) error {
	select {
	case s.slots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Semaphore) TryAcquire() bool {
	select {
	case s.slots <- struct{}{}:
		return true
	default:
		return false
	}
}

func (s *Semaphore) Release() { <-s.slots }
