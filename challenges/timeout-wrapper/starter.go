package main

import (
	"context"
	"time"
)

func WithTimeout(ctx context.Context, d time.Duration, f func() int64) (int64, error) {
	// your code here
	return f(), nil
}
