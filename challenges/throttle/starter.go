package main

import "errors"

var (
	ErrBusy     = errors.New("busy")
	ErrCanceled = errors.New("canceled")
)

func Throttle(limit int, fn func()) (handle func() error, cancel func()) {
	// your code here
	return func() error { return nil }, func() {}
}
