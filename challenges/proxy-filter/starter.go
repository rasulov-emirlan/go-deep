package main

import (
	"context"
	"net/http"
)

type Product struct {
	ID       int     `json:"id"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
}

// Fetcher calls the upstream service.
type Fetcher func(ctx context.Context) ([]Product, error)

func ProductsHandler(fetch Fetcher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// your code here
	}
}
