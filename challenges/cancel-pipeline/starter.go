package main

import "context"

func Gen(ctx context.Context, nums ...int) <-chan int {
	// your code here
	return nil
}

func Map(ctx context.Context, in <-chan int, f func(int) int) <-chan int {
	// your code here
	return nil
}
