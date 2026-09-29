package main

import "context"

type Result struct {
	Source string
}

type SearchFunc func(ctx context.Context, query string) (Result, error)

func MultiSearch(ctx context.Context, query string, sfs []SearchFunc) (Result, error) {
	// your code here
	return Result{}, nil
}
