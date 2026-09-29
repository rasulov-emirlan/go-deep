package main

import "time"

func Delay(d time.Duration, fn func()) (cancel func() bool) {
	// your code here
	return func() bool { return false }
}
