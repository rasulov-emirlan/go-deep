package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
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
		q := r.URL.Query()
		category := q.Get("category")
		maxPrice := -1.0
		if s := q.Get("max_price"); s != "" {
			v, err := strconv.ParseFloat(s, 64)
			if err != nil || v < 0 {
				http.Error(w, "invalid max_price", http.StatusBadRequest)
				return
			}
			maxPrice = v
		}

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		all, err := fetch(ctx)
		if err != nil {
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
			return
		}

		out := make([]Product, 0, len(all))
		for _, p := range all {
			if category != "" && p.Category != category {
				continue
			}
			if maxPrice >= 0 && p.Price > maxPrice {
				continue
			}
			out = append(out, p)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}
