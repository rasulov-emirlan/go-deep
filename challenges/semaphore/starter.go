package main

import "context"

type Semaphore struct {
	// your fields
}

func NewSemaphore(n int) *Semaphore {
	// your code here
	return &Semaphore{}
}

func (s *Semaphore) Acquire(ctx context.Context) error {
	// your code here
	return nil
}

func (s *Semaphore) TryAcquire() bool {
	// your code here
	return false
}

func (s *Semaphore) Release() {
	// your code here
}
