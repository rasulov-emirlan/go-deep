package main

import "sync"

func Merge[T any](chans ...<-chan T) <-chan T {
	out := make(chan T)
	var wg sync.WaitGroup
	for _, ch := range chans {
		wg.Go(func() {
			for v := range ch {
				out <- v
			}
		})
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}
