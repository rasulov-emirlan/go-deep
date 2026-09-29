package main

import (
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

// run calls RunAll with a one-second limit.
func run(fns ...func()) ([]error, error) {
	res := make(chan []error, 1)
	go func() { res <- RunAll(fns...) }()
	select {
	case errs := <-res:
		return errs, nil
	case <-time.After(time.Second):
		return nil, errors.New("RunAll didn't return within a second")
	}
}

func main() {
	fine := func() {}
	check("no panics: all nil", func() (any, any) {
		errs, err := run(fine, fine)
		return []any{errs, err}, []any{[]error{nil, nil}, nil}
	})
	ok("a panic becomes that index's error", func() (bool, string) {
		errs, err := run(fine, func() { panic(123) }, fine)
		if err != nil || len(errs) != 3 {
			return false, fmt.Sprintf("got %v, %v", errs, err)
		}
		return errs[0] == nil && errs[2] == nil && errs[1] != nil && strings.Contains(errs[1].Error(), "123"),
			fmt.Sprintf("got %v, want [nil <error mentioning 123> nil]", errs)
	})
	ok("every function runs, even next to panics", func() (bool, string) {
		var n atomic.Int32
		count := func() { n.Add(1) }
		run(count, func() { panic("boom") }, count, func() { panic("bang") }, count)
		return n.Load() == 3, fmt.Sprintf("%d of 3 normal functions ran", n.Load())
	})
	ok("functions run concurrently", func() (bool, string) {
		// Each waits for the other, so running them one by one would hang.
		a, b := make(chan struct{}), make(chan struct{})
		_, err := run(
			func() { close(a); <-b },
			func() { close(b); <-a },
		)
		return err == nil, fmt.Sprint(err)
	})
	ok("no functions", func() (bool, string) {
		errs, err := run()
		return err == nil && len(errs) == 0, fmt.Sprintf("got %v, %v", errs, err)
	})
	done()
}
