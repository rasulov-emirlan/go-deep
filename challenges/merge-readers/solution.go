package main

import (
	"errors"
	"io"
	"sync"
)

type lockedWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

func Forward(a, b io.Reader, out io.Writer) error {
	w := &lockedWriter{w: out}
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, r := range []io.Reader{a, b} {
		wg.Go(func() {
			_, errs[i] = io.Copy(w, r)
		})
	}
	wg.Wait()
	return errors.Join(errs...)
}
