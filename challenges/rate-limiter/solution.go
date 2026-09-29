package main

import (
	"context"
	"time"
)

type Limiter struct {
	tick *time.Ticker
}

func NewLimiter(rps int) *Limiter {
	return &Limiter{tick: time.NewTicker(time.Second / time.Duration(rps))}
}

func (l *Limiter) Wait(ctx context.Context) error {
	select {
	case <-l.tick.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (l *Limiter) Stop() { l.tick.Stop() }
