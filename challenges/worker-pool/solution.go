package main

import (
	"context"
	"sync"
)

type Order struct {
	CourierID int
}

func FetchOrders(ctx context.Context, ids <-chan int, workers int, get func(id int) Order) <-chan Order {
	out := make(chan Order)
	var wg sync.WaitGroup
	for range workers {
		wg.Go(func() {
			for {
				select {
				case <-ctx.Done():
					return
				case id, ok := <-ids:
					if !ok || ctx.Err() != nil {
						return
					}
					select {
					case out <- get(id):
					case <-ctx.Done():
						return
					}
				}
			}
		})
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}
