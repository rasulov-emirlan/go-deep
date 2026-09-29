package main

import (
	"context"
	"fmt"
	"time"
)

func WithTimeout(ctx context.Context, d time.Duration, f func() int64) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, d)
	defer cancel()

	res := make(chan int64, 1)
	go func() { res <- f() }()

	select {
	case v := <-res:
		return v, nil
	case <-ctx.Done():
		return 0, fmt.Errorf("slow call: %w", ctx.Err())
	}
}
