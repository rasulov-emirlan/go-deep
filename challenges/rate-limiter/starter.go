package main

import "context"

type Limiter struct {
	// your fields
}

func NewLimiter(rps int) *Limiter {
	// your code here
	return &Limiter{}
}

func (l *Limiter) Wait(ctx context.Context) error {
	// your code here
	return nil
}

func (l *Limiter) Stop() {
	// your code here
}
