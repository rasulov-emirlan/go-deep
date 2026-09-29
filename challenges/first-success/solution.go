package main

import (
	"context"
	"errors"
)

type Result struct {
	Source string
}

type SearchFunc func(ctx context.Context, query string) (Result, error)

func MultiSearch(ctx context.Context, query string, sfs []SearchFunc) (Result, error) {
	if len(sfs) == 0 {
		return Result{}, errors.New("no search functions")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	type res struct {
		r   Result
		err error
	}
	ch := make(chan res, len(sfs))
	for _, sf := range sfs {
		go func() {
			r, err := sf(ctx, query)
			ch <- res{r, err}
		}()
	}

	var lastErr error
	for range sfs {
		select {
		case x := <-ch:
			if x.err == nil {
				return x.r, nil
			}
			lastErr = x.err
		case <-ctx.Done():
			return Result{}, ctx.Err()
		}
	}
	return Result{}, lastErr
}
