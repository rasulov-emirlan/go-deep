package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
)

var catalog = []Product{
	{1, "tv", 500}, {2, "phone", 300}, {3, "tv", 150}, {4, "phone", 900},
}

func stock(ctx context.Context) ([]Product, error) { return catalog, nil }

type reply struct {
	code  int
	ctype string
	ids   []int
}

func serve(fetch Fetcher, url string) reply {
	rec := httptest.NewRecorder()
	ProductsHandler(fetch)(rec, httptest.NewRequest("GET", url, nil))
	res := reply{code: rec.Code, ctype: rec.Header().Get("Content-Type")}
	if rec.Code == 200 {
		var ps []Product
		if err := json.Unmarshal(rec.Body.Bytes(), &ps); err != nil || ps == nil {
			res.ids = []int{-1} // not a JSON array
		}
		for _, p := range ps {
			res.ids = append(res.ids, p.ID)
		}
	}
	return res
}

type ctxKey struct{}

func main() {
	check("filters by category and price", func() (any, any) {
		return serve(stock, "/products?category=tv&max_price=200"), reply{200, "application/json", []int{3}}
	})
	check("no filters returns everything", func() (any, any) {
		return serve(stock, "/products"), reply{200, "application/json", []int{1, 2, 3, 4}}
	})
	ok("no match is an empty JSON array", func() (bool, string) {
		rec := httptest.NewRecorder()
		ProductsHandler(stock)(rec, httptest.NewRequest("GET", "/products?category=car", nil))
		body := rec.Body.String()
		return rec.Code == 200 && (body == "[]" || body == "[]\n"), fmt.Sprintf("got %d %q, want 200 []", rec.Code, body)
	})
	check("bad max_price is 400", func() (any, any) {
		return serve(stock, "/products?max_price=cheap").code, 400
	})
	check("upstream failure is 502", func() (any, any) {
		broken := func(ctx context.Context) ([]Product, error) { return nil, errors.New("connection refused") }
		return serve(broken, "/products").code, 502
	})
	ok("upstream call gets the request context with a timeout", func() (bool, string) {
		var got context.Context
		spy := func(ctx context.Context) ([]Product, error) { got = ctx; return catalog, nil }
		req := httptest.NewRequest("GET", "/products", nil)
		req = req.WithContext(context.WithValue(req.Context(), ctxKey{}, "trace-1"))
		ProductsHandler(spy)(httptest.NewRecorder(), req)
		if got == nil || got.Value(ctxKey{}) != "trace-1" {
			return false, "fetch did not get a context derived from r.Context()"
		}
		_, hasDeadline := got.Deadline()
		return hasDeadline, "the upstream call has no deadline"
	})
	done()
}
