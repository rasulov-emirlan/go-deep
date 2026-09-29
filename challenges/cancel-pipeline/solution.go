package main

import "context"

func Gen(ctx context.Context, nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			select {
			case out <- n:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func Map(ctx context.Context, in <-chan int, f func(int) int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case v, ok := <-in:
				if !ok || ctx.Err() != nil {
					return
				}
				select {
				case out <- f(v):
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return out
}
