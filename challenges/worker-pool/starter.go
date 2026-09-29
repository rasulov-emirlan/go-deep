package main

import "context"

type Order struct {
	CourierID int
}

func FetchOrders(ctx context.Context, ids <-chan int, workers int, get func(id int) Order) <-chan Order {
	// your code here
	return nil
}
