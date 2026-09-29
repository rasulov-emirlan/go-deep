package main

import "time"

func Delay(d time.Duration, fn func()) (cancel func() bool) {
	return time.AfterFunc(d, fn).Stop
}
