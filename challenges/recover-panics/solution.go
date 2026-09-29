package main

import (
	"fmt"
	"sync"
)

func RunAll(fns ...func()) []error {
	errs := make([]error, len(fns))
	var wg sync.WaitGroup
	for i, fn := range fns {
		wg.Go(func() {
			defer func() {
				if r := recover(); r != nil {
					errs[i] = fmt.Errorf("panic: %v", r)
				}
			}()
			fn()
		})
	}
	wg.Wait()
	return errs
}
